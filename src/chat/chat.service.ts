import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { sessions, messages, users } from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import { OpenAIAdapter, ChatMessage } from '../ai/adapters/openai.adapter';
import { DalleAdapter } from '../ai/adapters/dalle.adapter';
import { SearchAdapter } from '../ai/adapters/search.adapter';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

// PDF parse için dynamic import kullanacağız

const IMAGE_KEYWORDS = [
    'görsel',
    'resim',
    'çiz',
    'oluştur',
    'göster',
    'fotoğraf',
    'manzara',
    'image',
    'picture',
    'draw',
    'create',
    'generate',
    'photo',
    'paint',
    'sketch',
];

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
        private openai: OpenAIAdapter,
        private dalle: DalleAdapter,
        private search: SearchAdapter,
        private usersService: UsersService,
        private configService: ConfigService,
    ) { }

    private isImageRequest(message: any): boolean {
        // If message contains an uploaded image, this is NOT an image generation request
        // It's an image ANALYSIS request - should go to GPT Vision, not DALL-E
        if (Array.isArray(message)) {
            const hasUploadedImage = message.some((part: any) => part.type === 'image_url');
            if (hasUploadedImage) {
                return false; // Send to GPT Vision for analysis, not DALL-E
            }
            
            const textParts = message
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
            const lowerMessage = textParts.toLowerCase();
            return IMAGE_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
        }

        if (typeof message === 'string') {
            const lowerMessage = message.toLowerCase();
            return IMAGE_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
        }

        return false;
    }

    // PDF'den metin çıkarma
    private async extractPdfText(base64Data: string): Promise<string> {
        try {
            // data:application/pdf;base64, kısmını kaldır
            const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, '');
            const buffer = Buffer.from(base64Clean, 'base64');
            
            // pdf-parse v1.x - simple function call
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(buffer);
            this.logger.log(`[PDF] Extracted ${data.text.length} characters from PDF`);
            return data.text;
        } catch (error) {
            this.logger.error('[PDF] Error extracting text:', error);
            return '[PDF içeriği okunamadı]';
        }
    }

    // Mesajda PDF var mı kontrol et ve işle
    private async processMessageContent(message: any): Promise<string | any[]> {
        this.logger.log(`[processMessageContent] Input type: ${typeof message}, isArray: ${Array.isArray(message)}`);
        
        if (typeof message === 'string') {
            return message;
        }

        if (Array.isArray(message)) {
            this.logger.log(`[processMessageContent] Array length: ${message.length}`);
            const processedParts: any[] = [];
            let pdfText = '';

            for (const part of message) {
                this.logger.log(`[processMessageContent] Processing part type: ${part.type}`);
                
                if (part.type === 'pdf' && part.pdf_data?.url) {
                    // PDF'den metin çıkar
                    this.logger.log(`[processMessageContent] Found PDF: ${part.pdf_data.name}`);
                    const extractedText = await this.extractPdfText(part.pdf_data.url);
                    this.logger.log(`[processMessageContent] PDF extracted text length: ${extractedText.length}`);
                    pdfText = `\n\n[PDF Dosyası: ${part.pdf_data.name || 'document.pdf'}]\n\`\`\`\n${extractedText}\n\`\`\``;
                } else if (part.type === 'text') {
                    processedParts.push(part);
                } else if (part.type === 'image_url') {
                    processedParts.push(part);
                }
            }

            // Eğer PDF varsa, text'e ekle
            if (pdfText) {
                const textPart = processedParts.find(p => p.type === 'text');
                if (textPart) {
                    textPart.text = (textPart.text || '') + pdfText;
                } else {
                    processedParts.unshift({ type: 'text', text: pdfText });
                }
            }

            // Sadece image_url varsa array döndür, yoksa string
            const hasImage = processedParts.some(p => p.type === 'image_url');
            if (hasImage) {
                return processedParts;
            } else {
                return processedParts.map(p => p.text || '').join('');
            }
        }

        return message;
    }

    async createSession(userId: number, title?: string) {
        console.log(`[ChatService] Creating session for user ${userId}...`);
        const [session] = await this.db
            .insert(sessions)
            .values({
                userId,
                title: title?.trim() || 'New Chat',
            })
            .returning();

        console.log(`[ChatService] ✅ Session created: ${session.id}`);
        
        // Verify session exists immediately
        const verification = await this.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, session.id))
            .limit(1);
        
        if (verification.length === 0) {
            console.error(`[ChatService] ❌ Session ${session.id} not found after creation!`);
        } else {
            console.log(`[ChatService] ✅ Session ${session.id} verified in database`);
        }

        return session;
    }

    async getUserSessions(userId: number) {
        return this.db
            .select()
            .from(sessions)
            .where(eq(sessions.userId, userId))
            .orderBy(desc(sessions.updatedAt));
    }

    async getSessionMessages(sessionId: string, userId: number) {
        await this.ensureSessionOwnership(sessionId, userId);

        return this.db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId))
            .orderBy(messages.createdAt);
    }

    async getRecentMessages(sessionId: string, limit: number = 20) {
        const history = await this.db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId))
            .orderBy(desc(messages.createdAt))
            .limit(limit);

        return history.reverse();
    }

    async sendMessage(
        sessionId: string,
        userId: number,
        userMessage: any,
        model: string = 'gpt-4o',
        mode?: string,
    ): Promise<{
        response: string;
        userMessageId: number;
        assistantMessageId?: number;
    }> {
        await this.validatePremiumAccess(userId, model, mode);
        await this.ensureSessionOwnership(sessionId, userId);

        // Validate message content
        if (!userMessage || (typeof userMessage === 'string' && userMessage.trim() === '')) {
            throw new Error('Message content cannot be empty');
        }

        // Log incoming message type for debugging
        this.logger.log(`[sendMessage] Message type: ${typeof userMessage}, isArray: ${Array.isArray(userMessage)}`);
        if (Array.isArray(userMessage)) {
            this.logger.log(`[sendMessage] Message parts: ${JSON.stringify(userMessage.map(p => ({ type: p.type, hasImageUrl: !!p.image_url })))}`);
        }

        // Serialize array messages as JSON for database storage
        const contentToStore = Array.isArray(userMessage) ? JSON.stringify(userMessage) : userMessage;

        const [userMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'user',
                content: contentToStore,
                model: model,
            })
            .returning();

        const messageCount = await this.db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId));

        if (messageCount.length === 1) {
            let titleText = '';
            if (typeof userMessage === 'string') {
                titleText = userMessage;
            } else if (Array.isArray(userMessage)) {
                titleText = userMessage
                    .filter((part: any) => part.type === 'text')
                    .map((part: any) => part.text || '')
                    .join(' ');
            }

            if (titleText) {
                const title =
                    titleText.substring(0, 40) + (titleText.length > 40 ? '...' : '');
                await this.db
                    .update(sessions)
                    .set({ title, updatedAt: new Date() })
                    .where(eq(sessions.id, sessionId));
            }
        }

        let messageText = '';
        if (typeof userMessage === 'string') {
            messageText = userMessage;
        } else if (Array.isArray(userMessage)) {
            messageText = userMessage
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
        }

        if (mode === 'image' || this.isImageRequest(userMessage)) {
            const imageResponse = await this.handleImageRequest(
                sessionId,
                messageText || 'Generate an image',
                model,
            );
            return { response: imageResponse, userMessageId: userMsg.id };
        }

        if (mode === 'web') {
            const bingKey = this.configService.get<string>('BING_API_KEY');
            if (bingKey) {
                const searchResult = await this.search.search(messageText || '');
                let responseText = '';
                if (searchResult.type === 'results') {
                    responseText = searchResult.results
                        .map(
                            (r: any, idx: number) =>
                                `${idx + 1}. ${r.name}\n${r.snippet}\n${r.url}`,
                        )
                        .join('\n\n');
                } else if (searchResult.type === 'fallback') {
                    responseText = searchResult.message;
                } else {
                    responseText = searchResult.message || 'No results';
                }

                const [assistantMsg] = await this.db
                    .insert(messages)
                    .values({
                        sessionId,
                        role: 'assistant',
                        content: responseText,
                        model: model,
                    })
                    .returning();
                await this.touchSession(sessionId);
                return {
                    response: responseText,
                    userMessageId: userMsg.id,
                    assistantMessageId: assistantMsg.id,
                };
            }

            const history = await this.getRecentMessages(sessionId);
            const chatMessages: ChatMessage[] = history.map((msg) => {
                let content: any = msg.content;
                if (typeof content === 'string') {
                    try {
                        const parsed = JSON.parse(content);
                        if (typeof parsed === 'object') content = parsed;
                    } catch (e) { }
                }
                return {
                    role: msg.role as 'user' | 'assistant',
                    content: content,
                };
            });

            const aiResponse = await this.openai.chat(chatMessages, model, 'web');
            const [assistantMsg2] = await this.db
                .insert(messages)
                .values({
                    sessionId,
                    role: 'assistant',
                    content: aiResponse,
                    model: model,
                })
                .returning();
            await this.touchSession(sessionId);
            return {
                response: aiResponse,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg2.id,
            };
        }

        const history = await this.getRecentMessages(sessionId);
        const chatMessages: ChatMessage[] = history.map((msg) => {
            let content: any = msg.content;
            if (typeof content === 'string') {
                try {
                    const parsed = JSON.parse(content);
                    if (typeof parsed === 'object') content = parsed;
                } catch (e) { }
            }
            return {
                role: msg.role as 'user' | 'assistant',
                content: content,
            };
        });

        const aiResponse = await this.openai.chat(chatMessages, model);

        const [assistantMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'assistant',
                content: aiResponse,
                model: model,
            })
            .returning();
        await this.touchSession(sessionId);

        return {
            response: aiResponse,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
        };
    }

    async sendMessageStream(
        sessionId: string,
        userId: number,
        userMessage: any,
        onChunk: (chunk: string) => void,
        model: string = 'gpt-4o',
        mode?: string,
    ): Promise<{
        sessionId: string;
        userMessageId: number;
        assistantMessageId?: number;
    }> {
        await this.validatePremiumAccess(userId, model, mode);
        await this.ensureSessionOwnership(sessionId, userId);

        // Ensure content is not null/undefined
        if (!userMessage || (typeof userMessage === 'string' && userMessage.trim() === '')) {
            throw new Error('Message content cannot be empty');
        }

        // Log incoming message type for debugging
        this.logger.log(`[sendMessageStream] Message type: ${typeof userMessage}, isArray: ${Array.isArray(userMessage)}`);
        if (Array.isArray(userMessage)) {
            this.logger.log(`[sendMessageStream] Message parts: ${JSON.stringify(userMessage.map(p => ({ type: p.type, hasImageUrl: !!p.image_url, hasPdf: !!p.pdf_data })))}`);
        }

        // PDF ve diğer dosyaları işle
        const processedMessage = await this.processMessageContent(userMessage);
        this.logger.log(`[sendMessageStream] Processed message type: ${typeof processedMessage}, isArray: ${Array.isArray(processedMessage)}`);

        // Serialize array messages as JSON for database storage
        const contentToStore = Array.isArray(processedMessage) ? JSON.stringify(processedMessage) : processedMessage;

        const [userMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'user',
                content: contentToStore,
            })
            .returning();

        let messageText = '';
        if (typeof processedMessage === 'string') {
            messageText = processedMessage;
        } else if (Array.isArray(processedMessage)) {
            messageText = processedMessage
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
        }

        if (mode === 'image' || this.isImageRequest(processedMessage)) {
            const imageResponse = await this.handleImageRequest(
                sessionId,
                messageText || 'Generate an image',
                model,
            );
            onChunk(imageResponse);
            return { sessionId, userMessageId: userMsg.id };
        }

        if (mode === 'web') {
            const bingKey = this.configService.get<string>('BING_API_KEY');
            if (bingKey) {
                const searchResult = await this.search.search(messageText || '');
                let responseText = '';
                if (searchResult.type === 'results') {
                    responseText = searchResult.results
                        .map(
                            (r: any, idx: number) =>
                                `${idx + 1}. ${r.name}\n${r.snippet}\n${r.url}`,
                        )
                        .join('\n\n');
                } else if (searchResult.type === 'fallback') {
                    responseText = searchResult.message;
                } else {
                    responseText = searchResult.message || 'No results';
                }

                onChunk(responseText);
                const [assistantMsg] = await this.db
                    .insert(messages)
                    .values({
                        sessionId,
                        role: 'assistant',
                        content: responseText,
                        model: model,
                    })
                    .returning();
                await this.touchSession(sessionId);
                return {
                    sessionId,
                    userMessageId: userMsg.id,
                    assistantMessageId: assistantMsg.id,
                };
            }

            const history = await this.getRecentMessages(sessionId);
            const chatMessages: ChatMessage[] = history.map((msg) => {
                let content: any = msg.content;
                if (typeof content === 'string') {
                    try {
                        const parsed = JSON.parse(content);
                        if (typeof parsed === 'object') content = parsed;
                    } catch (e) { }
                }
                return {
                    role: msg.role as 'user' | 'assistant',
                    content: content,
                };
            });

            let full = '';
            await this.openai.streamChat(
                chatMessages,
                (c) => {
                    full += c;
                    onChunk(c);
                },
                model,
            );
            const [assistantMsg] = await this.db
                .insert(messages)
                .values({
                    sessionId,
                    role: 'assistant',
                    content: full,
                    model: model,
                })
                .returning();
            await this.touchSession(sessionId);
            return {
                sessionId,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
            };
        }

        const history = await this.getRecentMessages(sessionId);
        const chatMessages: ChatMessage[] = history.map((msg) => {
            let content: any = msg.content;
            if (typeof content === 'string') {
                try {
                    const parsed = JSON.parse(content);
                    if (typeof parsed === 'object') content = parsed;
                } catch (e) { }
            }
            return {
                role: msg.role as 'user' | 'assistant',
                content: content,
            };
        });

        let fullResponse = '';

        await this.openai.streamChat(
            chatMessages,
            (chunk) => {
                fullResponse += chunk;
                onChunk(chunk);
            },
            model,
        );

        const [assistantMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'assistant',
                content: fullResponse,
                model: model,
            })
            .returning();

        await this.touchSession(sessionId);
        await this.autoGenerateTitle(sessionId);

        return {
            sessionId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
        };
    }

    async deleteSession(sessionId: string, userId: number) {
        await this.ensureSessionOwnership(sessionId, userId);

        await this.db.delete(messages).where(eq(messages.sessionId, sessionId));
        await this.db.delete(sessions).where(eq(sessions.id, sessionId));

        return { success: true };
    }

    async updateSession(sessionId: string, userId: number, title: string) {
        await this.ensureSessionOwnership(sessionId, userId);

        await this.db
            .update(sessions)
            .set({ title: title.trim(), updatedAt: new Date() })
            .where(eq(sessions.id, sessionId));

        const [updated] = await this.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        return updated;
    }

    private async ensureSessionOwnership(sessionId: string, userId: number) {
        // Debug logları sadece development'ta göster
        const isVerbose = process.env.DEBUG_SESSIONS === 'true';
        
        if (isVerbose) {
            console.log(`[ensureSessionOwnership] Checking session ${sessionId} for user ${userId}...`);
        }
        
        const [session] = await this.db
            .select({
                id: sessions.id,
                ownerId: sessions.userId,
            })
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        if (!session) {
            console.error(`[ensureSessionOwnership] ❌ Session ${sessionId} not found in database`);
            throw new Error('Session not found or unauthorized');
        }

        if (isVerbose) {
            console.log(`[ensureSessionOwnership] Found session ${sessionId}, owner: ${session.ownerId}, requesting user: ${userId}`);
        }

        // Normalize both to numbers for comparison (handle potential type mismatches)
        const normalizedOwnerId = typeof session.ownerId === 'string' ? parseInt(session.ownerId, 10) : session.ownerId;
        const normalizedUserId = typeof userId === 'string' ? parseInt(userId as any, 10) : userId;

        if (normalizedOwnerId !== normalizedUserId) {
            console.error(`[ensureSessionOwnership] ❌ User ${normalizedUserId} doesn't own session ${sessionId} (owner: ${normalizedOwnerId})`);
            throw new Error('Session not found or unauthorized');
        }
        
        if (isVerbose) {
            console.log(`[ensureSessionOwnership] ✅ Ownership verified`);
        }
    }

    private async touchSession(sessionId: string) {
        await this.db
            .update(sessions)
            .set({ updatedAt: new Date() })
            .where(eq(sessions.id, sessionId));
    }

    private async handleImageRequest(
        sessionId: string,
        prompt: string,
        model?: string,
    ) {
        try {
            const [session] = await this.db
                .select({ userId: sessions.userId })
                .from(sessions)
                .where(eq(sessions.id, sessionId))
                .limit(1);

            if (!session) {
                throw new Error('Session not found');
            }

            const user = await this.usersService.findById(session.userId);
            if (!user) {
                throw new Error('User not found');
            }

            const now = new Date();
            const isPremium = user.isPremium || false;
            const subscriptionEnd = user.subscriptionExpiresAt
                ? new Date(user.subscriptionExpiresAt)
                : null;
            const isAdmin = user.isAdmin;
            const imageCredits = user.imageCredits || 0;

            const hasActivePremium =
                isPremium && (!subscriptionEnd || subscriptionEnd > now);

            if (!isAdmin && !hasActivePremium && imageCredits >= 1) {
                const limitMsg =
                    '🚫 **محدودیت ساخت تصویر شما تمام شد!**\n\n' +
                    'حساب‌های رایگان فقط می‌توانند **۱ تصویر** بسازند.\n\n' +
                    '✨ برای ساخت تصاویر نامحدود، به **پریمیوم ارتقا دهید**!';

                await this.db.insert(messages).values({
                    sessionId,
                    role: 'assistant',
                    content: limitMsg,
                    model: model,
                });
                await this.touchSession(sessionId);
                return limitMsg;
            }

            const cleanPrompt = prompt.trim();

            if (!cleanPrompt) {
                const errorMsg = '❌ لطفاً توضیحی برای تصویر مورد نظر خود بنویسید.';
                await this.db.insert(messages).values({
                    sessionId,
                    role: 'assistant',
                    content: errorMsg,
                    model: model,
                });
                await this.touchSession(sessionId);
                return errorMsg;
            }

            const imageUrl = await this.dalle.generateImage(cleanPrompt);
            const imageResponse = `![AI Generated Image](${imageUrl})`;

            if (!isAdmin) {
                await this.usersService.incrementImageCredits(session.userId);
            }

            await this.db.insert(messages).values({
                sessionId,
                role: 'assistant',
                content: imageResponse,
                model: model,
            });
            await this.touchSession(sessionId);

            return imageResponse;
        } catch (error: any) {
            this.logger.error('Image generation failed:', error.message);

            let errorMsg = '❌ تولید تصویر با خطا مواجه شد. لطفاً دوباره تلاش کنید.';

            if (error.message.includes('safety system')) {
                errorMsg =
                    '⚠️ درخواست شما توسط سیستم امنیتی رد شد.\n\nلطفاً:\n• از کلمات مناسب و محترمانه استفاده کنید\n• محتوای حساس، خشونت‌آمیز یا نامناسب درخواست نکنید\n• توضیحات واضح‌تر برای تصویر مورد نظر بنویسید';
            } else if (error.message.includes('400')) {
                errorMsg =
                    '⚠️ درخواست نامعتبر. لطفاً توضیحات واضح‌تری برای تصویر بنویسید.';
            } else if (
                error.message.includes('429') ||
                error.message.includes('rate')
            ) {
                errorMsg =
                    '⏳ تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.';
            }

            await this.db.insert(messages).values({
                sessionId,
                role: 'assistant',
                content: errorMsg,
                model: model,
            });
            await this.touchSession(sessionId);
            return errorMsg;
        }
    }

    private async validatePremiumAccess(
        userId: number,
        model: string,
        mode?: string,
    ) {
        const user = await this.usersService.findById(userId);

        if (!user) {
            throw new Error('User not found');
        }

        if (user.isAdmin) {
            return;
        }

        const PREMIUM_MODELS = [
            'gpt-5.1-auto',
            'gpt-5.1-instant',
            'gpt-5.1-thinking',
            'gpt-5.1-pro',
            'gpt-4-turbo',
        ];

        const PREMIUM_MODES = ['image', 'web'];

        // Localhost/development için premium kontrolünü atla
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

        if (!isDevelopment && PREMIUM_MODELS.includes(model)) {
            if (
                !user.subscriptionExpiresAt ||
                new Date(user.subscriptionExpiresAt) < new Date()
            ) {
                const error: any = new Error('این مدل نیازمند اشتراک پلاس است.');
                error.code = 'PREMIUM_REQUIRED';
                throw error;
            }
        }

        if (!isDevelopment && mode && PREMIUM_MODES.includes(mode)) {
            if (
                !user.subscriptionExpiresAt ||
                new Date(user.subscriptionExpiresAt) < new Date()
            ) {
                const error: any = new Error('این قابلیت نیازمند اشتراک پلاس است.');
                error.code = 'PREMIUM_REQUIRED';
                throw error;
            }
        }

        return;
    }

    private async autoGenerateTitle(sessionId: string) {
        try {
            const [session] = await this.db
                .select()
                .from(sessions)
                .where(eq(sessions.id, sessionId));

            if (
                !session ||
                (session.title !== 'New Chat' && session.title !== 'Yeni Sohbet')
            ) {
                return;
            }

            const sessionMessages = await this.db
                .select()
                .from(messages)
                .where(eq(messages.sessionId, sessionId))
                .orderBy(messages.createdAt)
                .limit(2);

            const firstUserMsg = sessionMessages.find((m) => m.role === 'user');
            if (!firstUserMsg) return;

            let content = firstUserMsg.content;
            if (typeof content === 'string') {
                try {
                    const parsed = JSON.parse(content);
                    if (typeof parsed === 'object' && parsed.text) {
                        content = parsed.text;
                    } else if (Array.isArray(parsed)) {
                        const textPart = parsed.find((p: any) => p.type === 'text');
                        if (textPart) content = textPart.text;
                    }
                } catch (e) { }
            }

            const messageText =
                typeof content === 'string' ? content : JSON.stringify(content);

            let title = messageText.substring(0, 50);
            if (messageText.length > 50) {
                title = title.substring(0, title.lastIndexOf(' ')) + '...';
            }

            await this.db
                .update(sessions)
                .set({ title })
                .where(eq(sessions.id, sessionId));
        } catch (error) {
            this.logger.error('Auto title generation failed:', error);
        }
    }

    async regenerateLastMessage(sessionId: string, userId: number, model?: string) {
        await this.ensureSessionOwnership(sessionId, userId);
        await this.validatePremiumAccess(userId, model || 'gpt-4o');
        const history = await this.getRecentMessages(sessionId, 10);
        if (history.length === 0) {
            throw new Error('No messages to regenerate');
        }
        const lastAssistantIndex = history.map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'assistant')?.i;
        if (lastAssistantIndex !== undefined && lastAssistantIndex >= 0) {
            await this.db.delete(messages).where(eq(messages.id, history[lastAssistantIndex].id));
        }
        const chatMessages: ChatMessage[] = history.slice(0, lastAssistantIndex || history.length).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content as any,
        }));
        const response = await this.openai.chat(chatMessages, model || 'gpt-4o');
        await this.db.insert(messages).values({ sessionId, role: 'assistant', content: response, model: model || 'gpt-4o' });
        await this.touchSession(sessionId);
        return response;
    }

    async editMessage(messageId: number, userId: number, content: string) {
        const [msg] = await this.db
            .select({ id: messages.id, sessionId: messages.sessionId })
            .from(messages)
            .where(eq(messages.id, messageId));
        if (!msg) throw new Error('Message not found');
        await this.ensureSessionOwnership(msg.sessionId, userId);
        await this.db
            .update(messages)
            .set({ content })
            .where(eq(messages.id, messageId));
        await this.touchSession(msg.sessionId);
        return { success: true };
    }
}
