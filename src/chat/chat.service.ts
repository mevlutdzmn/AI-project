import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { sessions, messages, users } from '../database/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { OpenAIAdapter, ChatMessage } from '../ai/adapters/openai.adapter';
import { DalleAdapter } from '../ai/adapters/dalle.adapter';
import { SearchAdapter } from '../ai/adapters/search.adapter';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from '../memory/memory.service';

// PDF parse için dynamic import kullanacağız

const IMAGE_KEYWORDS = [
    // ==================== TÜRKÇE ====================
    // Fiil kombinasyonları
    'resim yap',
    'resmi yap',
    'resim yapar mısın',
    'resmi yapar mısın',
    'resim yaparmısın',
    'resmi yaparmısın',
    'resim oluştur',
    'resmi oluştur',
    'resim çiz',
    'resmi çiz',
    'görsel yap',
    'görsel oluştur',
    'görsel çiz',
    'fotoğraf yap',
    'fotoğraf oluştur',
    'fotoğraf çiz',
    // İstek cümleleri
    'bir resim',
    'bana resim',
    'bana bir resim',
    'bana görsel',
    'bana bir görsel',
    'bana fotoğraf',
    'benim için resim',
    'benim için görsel',
    'resim istiyorum',
    'görsel istiyorum',
    'resim lazım',
    'görsel lazım',
    'resim ver',
    'görsel ver',
    'resim gönder',
    'görsel gönder',
    'resim üret',
    'görsel üret',
    'resim tasarla',
    'görsel tasarla',
    // Soru formları
    'resim yapabilir misin',
    'görsel yapabilir misin',
    'resim oluşturabilir misin',
    'görsel oluşturabilir misin',
    'resim çizebilir misin',
    'görsel çizebilir misin',
    'resim yapar mısın',
    'görsel yapar mısın',
    // Tekil kelimeler
    'görsel',
    'çiz',
    'illüstrasyon',
    'grafik',
    'manzara',
    'portre',
    'karikatür',
    'anime',
    'logo',
    'ikon',
    'afiş',
    'poster',
    'kapak',
    'avatar',
    'karakter',
    'sahne',
    'tasarım',
    'eskiz',
    'taslak',
    
    // ==================== FARSÇA (فارسی) ====================
    // Fiil kombinasyonları
    'تصویر بساز',
    'عکس بساز',
    'تصویر بکش',
    'عکس بکش',
    'تصویر درست کن',
    'عکس درست کن',
    'تصویر ایجاد کن',
    'عکس ایجاد کن',
    'نقاشی کن',
    'نقاشی بکش',
    'طراحی کن',
    'طراحی بکش',
    // İstek cümleleri
    'یک تصویر',
    'یه تصویر',
    'یک عکس',
    'یه عکس',
    'برام تصویر',
    'برایم تصویر',
    'برام عکس',
    'برایم عکس',
    'تصویر بده',
    'عکس بده',
    'تصویر میخوام',
    'عکس میخوام',
    'تصویر می‌خوام',
    'عکس می‌خوام',
    'تصویر لازم دارم',
    'عکس لازم دارم',
    'تصویر میخواهم',
    'عکس میخواهم',
    // Soru formları
    'تصویر میسازی',
    'عکس میسازی',
    'تصویر می‌سازی',
    'عکس می‌سازی',
    'میتونی تصویر',
    'میتونی عکس',
    'می‌تونی تصویر',
    'می‌تونی عکس',
    'میشه تصویر',
    'میشه عکس',
    'می‌شه تصویر',
    'می‌شه عکس',
    // Tekil kelimeler
    'تصویر',
    'عکس',
    'بساز',
    'بکش',
    'نقاشی',
    'طراحی',
    'ایجاد',
    'گرافیک',
    'پوستر',
    'لوگو',
    'آیکون',
    'کاراکتر',
    'صحنه',
    'منظره',
    'چهره',
    'پرتره',
    'انیمه',
    'کارتون',
    'اسکیس',
    'طرح',
    
    // ==================== İNGİLİZCE (English) ====================
    // Verb combinations
    'create image',
    'create a image',
    'create an image',
    'create picture',
    'create a picture',
    'create photo',
    'create a photo',
    'generate image',
    'generate a image',
    'generate an image',
    'generate picture',
    'generate a picture',
    'generate photo',
    'draw image',
    'draw a image',
    'draw an image',
    'draw picture',
    'draw a picture',
    'draw me',
    'draw a',
    'draw an',
    'make image',
    'make a image',
    'make an image',
    'make picture',
    'make a picture',
    'make me a',
    'make me an',
    // Request phrases
    'i want image',
    'i want a image',
    'i want an image',
    'i want picture',
    'i want a picture',
    'i need image',
    'i need a image',
    'i need an image',
    'i need picture',
    'give me image',
    'give me a image',
    'give me an image',
    'give me picture',
    'show me image',
    'show me a image',
    'show me an image',
    'show me picture',
    // Question forms
    'can you create',
    'can you generate',
    'can you draw',
    'can you make',
    'could you create',
    'could you generate',
    'could you draw',
    'would you create',
    'would you draw',
    'please create',
    'please generate',
    'please draw',
    // Single keywords
    'image',
    'picture',
    'photo',
    'photograph',
    'draw',
    'paint',
    'sketch',
    'illustration',
    'artwork',
    'design',
    'graphic',
    'poster',
    'logo',
    'icon',
    'avatar',
    'character',
    'scene',
    'landscape',
    'portrait',
    'anime',
    'cartoon',
    'render',
    'visualize',
    'depict',
    'illustrate',
    'concept art',
    'digital art',
    'fan art',
    'wallpaper',
    'banner',
    'thumbnail',
    'cover art',
    'album art',
    'book cover',
    'movie poster',
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
        private memoryService: MemoryService,
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

    // PDF'den metin çıkarma - tablo yapısını koruyarak
    private async extractPdfText(base64Data: string): Promise<string> {
        try {
            // data:application/pdf;base64, kısmını kaldır
            const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, '');
            const buffer = Buffer.from(base64Clean, 'base64');
            
            // pdf-parse v1.x - simple function call
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            
            // Özel render fonksiyonu - sayfa düzenini korur
            const renderPage = (pageData: any) => {
                const renderOptions = {
                    normalizeWhitespace: false,
                    disableCombineTextItems: false,
                };
                return pageData.getTextContent(renderOptions).then((textContent: any) => {
                    let lastY: number | null = null;
                    let text = '';
                    
                    for (const item of textContent.items) {
                        if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
                            // Yeni satır - Y pozisyonu değişti
                            text += '\n';
                        } else if (lastY !== null) {
                            // Aynı satırda - tab ile ayır
                            text += '\t';
                        }
                        text += item.str;
                        lastY = item.transform[5];
                    }
                    return text;
                });
            };
            
            const data = await pdfParse(buffer, { pagerender: renderPage });
            
            // Boş satırları temizle ve formatla
            const cleanedText = data.text
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0)
                .join('\n');
            
            this.logger.log(`[PDF] Extracted ${cleanedText.length} characters from PDF`);
            return cleanedText;
        } catch (error) {
            this.logger.error('[PDF] Error extracting text:', error);
            return '[PDF içeriği okunamadı]';
        }
    }

    // Mesajda PDF var mı kontrol et ve işle
    // Returns: { displayContent: for database, aiContent: for AI with PDF text }
    private async processMessageContent(message: any): Promise<{ displayContent: string | any[], aiContent: string | any[] }> {
        this.logger.log(`[processMessageContent] Input type: ${typeof message}, isArray: ${Array.isArray(message)}`);
        
        if (typeof message === 'string') {
            return { displayContent: message, aiContent: message };
        }

        if (Array.isArray(message)) {
            this.logger.log(`[processMessageContent] Array length: ${message.length}`);
            const displayParts: any[] = [];
            const aiParts: any[] = [];
            let pdfText = '';
            let pdfFileName = '';

            for (const part of message) {
                this.logger.log(`[processMessageContent] Processing part type: ${part.type}`);
                
                if (part.type === 'pdf' && part.pdf_data?.url) {
                    // PDF'den metin çıkar - sadece AI için
                    this.logger.log(`[processMessageContent] Found PDF: ${part.pdf_data.name}`);
                    const extractedText = await this.extractPdfText(part.pdf_data.url);
                    this.logger.log(`[processMessageContent] PDF extracted text length: ${extractedText.length}`);
                    pdfText = `\n\n[PDF Dosyası: ${part.pdf_data.name || 'document.pdf'}]\n\`\`\`\n${extractedText}\n\`\`\``;
                    pdfFileName = part.pdf_data.name || 'document.pdf';
                } else if (part.type === 'text') {
                    displayParts.push(part);
                    aiParts.push({ ...part }); // Clone for AI
                } else if (part.type === 'image_url') {
                    displayParts.push(part);
                    aiParts.push(part);
                }
            }

            // Display content: sadece dosya adı referansı ile
            if (pdfFileName) {
                const textPart = displayParts.find(p => p.type === 'text');
                if (textPart) {
                    textPart.text = (textPart.text || '').trim() + ` [${pdfFileName}]`;
                } else {
                    displayParts.unshift({ type: 'text', text: `[${pdfFileName}]` });
                }
            }

            // AI content: PDF içeriği ile
            if (pdfText) {
                const aiTextPart = aiParts.find(p => p.type === 'text');
                if (aiTextPart) {
                    aiTextPart.text = (aiTextPart.text || '') + pdfText;
                } else {
                    aiParts.unshift({ type: 'text', text: pdfText });
                }
            }

            // Format outputs
            const hasImage = displayParts.some(p => p.type === 'image_url');
            
            const displayContent = hasImage 
                ? displayParts 
                : displayParts.map(p => p.text || '').join('');
            
            const aiContent = hasImage 
                ? aiParts 
                : aiParts.map(p => p.text || '').join('');

            return { displayContent, aiContent };
        }

        return { displayContent: message, aiContent: message };
    }

    async createSession(userId: number, title?: string) {
        this.logger.debug(`Creating session for user ${userId}...`);
        const [session] = await this.db
            .insert(sessions)
            .values({
                userId,
                title: title?.trim() || 'گفتگوی جدید',
            })
            .returning();

        this.logger.debug(`Session created: ${session.id}`);
        
        // Verify session exists immediately
        const verification = await this.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, session.id))
            .limit(1);
        
        if (verification.length === 0) {
            this.logger.error(`Session ${session.id} not found after creation!`);
        } else {
            this.logger.debug(`Session ${session.id} verified in database`);
        }

        return session;
    }

    async getUserSessions(userId: number) {
        return this.db
            .select()
            .from(sessions)
            .where(
                and(
                    eq(sessions.userId, userId),
                    eq(sessions.isDeleted, false),
                    eq(sessions.archived, false)
                )
            )
            .orderBy(desc(sessions.pinned), desc(sessions.updatedAt));
    }

    // Pinned sessions
    async getPinnedSessions(userId: number) {
        return this.db
            .select()
            .from(sessions)
            .where(
                and(
                    eq(sessions.userId, userId),
                    eq(sessions.isDeleted, false),
                    eq(sessions.pinned, true)
                )
            )
            .orderBy(desc(sessions.updatedAt));
    }

    // Archived sessions
    async getArchivedSessions(userId: number) {
        return this.db
            .select()
            .from(sessions)
            .where(
                and(
                    eq(sessions.userId, userId),
                    eq(sessions.isDeleted, false),
                    eq(sessions.archived, true)
                )
            )
            .orderBy(desc(sessions.updatedAt));
    }

    // Toggle pin
    async togglePinSession(sessionId: string, userId: number) {
        await this.ensureSessionOwnership(sessionId, userId);
        
        const [session] = await this.db
            .select({ pinned: sessions.pinned })
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        const [updated] = await this.db
            .update(sessions)
            .set({ pinned: !session.pinned, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .returning();

        return updated;
    }

    // Toggle archive
    async toggleArchiveSession(sessionId: string, userId: number) {
        await this.ensureSessionOwnership(sessionId, userId);
        
        const [session] = await this.db
            .select({ archived: sessions.archived })
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        const [updated] = await this.db
            .update(sessions)
            .set({ archived: !session.archived, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .returning();

        return updated;
    }

    // Move to folder
    async moveSessionToFolder(sessionId: string, userId: number, folderId: number | null) {
        await this.ensureSessionOwnership(sessionId, userId);

        const [updated] = await this.db
            .update(sessions)
            .set({ folderId, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .returning();

        return updated;
    }

    async getSessionMessages(sessionId: string, userId: number) {
        await this.ensureSessionOwnership(sessionId, userId);

        return this.db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId))
            .orderBy(messages.createdAt);
    }

    /**
     * Cursor-based pagination for messages (ChatGPT-style)
     * Returns messages older than beforeId, limited to `limit` count
     * Messages are returned in ascending order (oldest first for display)
     */
    async getSessionMessagesPaginated(
        sessionId: string,
        userId: number,
        limit: number = 10,
        beforeId?: number,
    ): Promise<{ messages: any[]; hasMore: boolean }> {
        await this.ensureSessionOwnership(sessionId, userId);

        // Build query conditions
        const conditions = [eq(messages.sessionId, sessionId)];
        
        if (beforeId) {
            // Get messages with ID less than beforeId (older messages)
            conditions.push(sql`${messages.id} < ${beforeId}`);
        }

        // Fetch limit + 1 to check if there are more
        const result = await this.db
            .select()
            .from(messages)
            .where(and(...conditions))
            .orderBy(desc(messages.id)) // Get newest of the "older" messages first
            .limit(limit + 1);

        const hasMore = result.length > limit;
        const messagesToReturn = hasMore ? result.slice(0, limit) : result;

        // Reverse to get ascending order (oldest first) for display
        return {
            messages: messagesToReturn.reverse(),
            hasMore,
        };
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

    /**
     * ✅ ChatGPT-style: Save voice transcript as message
     * Used by Realtime Voice API - no AI call needed (Realtime handles response)
     */
    async saveVoiceMessage(
        sessionId: string,
        userId: number,
        content: string,
        role: 'user' | 'assistant',
    ): Promise<number> {
        await this.ensureSessionOwnership(sessionId, userId);

        const [saved] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role,
                content,
                inputType: 'voice', // ✅ Mark as voice message
                model: 'gpt-4o-realtime', // Realtime API model
            })
            .returning({ id: messages.id });

        // Touch session to update timestamp
        await this.touchSession(sessionId);

        this.logger.debug(`Voice message saved: ${saved.id} (${role})`);
        return saved.id;
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
            this.logger.log(`[sendMessage] Message parts: ${JSON.stringify(userMessage.map(p => ({ type: p.type, hasImageUrl: !!p.image_url, hasPdf: !!p.pdf_data })))}`);
        }

        // PDF ve diğer dosyaları işle - displayContent DB için, aiContent AI için
        const { displayContent, aiContent } = await this.processMessageContent(userMessage);
        this.logger.log(`[sendMessage] Display content type: ${typeof displayContent}, AI content type: ${typeof aiContent}`);

        // Serialize array messages as JSON for database storage (display content - PDF içeriği yok)
        const contentToStore = Array.isArray(displayContent) ? JSON.stringify(displayContent) : displayContent;

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
            if (typeof displayContent === 'string') {
                titleText = displayContent;
            } else if (Array.isArray(displayContent)) {
                titleText = displayContent
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
        if (typeof aiContent === 'string') {
            messageText = aiContent;
        } else if (Array.isArray(aiContent)) {
            messageText = aiContent
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
        }

        if (mode === 'image' || this.isImageRequest(aiContent)) {
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
        sessionId: string | null,
        userId: number,
        userMessage: any,
        onChunk: (chunk: string) => void,
        model: string = 'gpt-4o',
        mode?: string,
    ): Promise<{
        sessionId: string;
        userMessageId: number;
        assistantMessageId?: number;
        isNewSession?: boolean;
    }> {
        await this.validatePremiumAccess(userId, model, mode);
        
        // ✅ ChatGPT tarzı: SessionId yoksa AI yanıtından SONRA session oluştur
        if (!sessionId) {
            return this.handleNewSessionWithAI(userId, userMessage, onChunk, model, mode);
        }
        
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

        // PDF ve diğer dosyaları işle - displayContent DB için, aiContent AI için
        const { displayContent, aiContent } = await this.processMessageContent(userMessage);
        this.logger.log(`[sendMessageStream] Display content type: ${typeof displayContent}, AI content type: ${typeof aiContent}`);

        // Serialize array messages as JSON for database storage (display content - PDF içeriği yok)
        const contentToStore = Array.isArray(displayContent) ? JSON.stringify(displayContent) : displayContent;

        const [userMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'user',
                content: contentToStore,
            })
            .returning();

        // ✅ İlk mesajda session title'ını otomatik güncelle
        this.autoUpdateSessionTitle(sessionId, displayContent);

        let messageText = '';
        if (typeof aiContent === 'string') {
            messageText = aiContent;
        } else if (Array.isArray(aiContent)) {
            messageText = aiContent
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
        }

        if (mode === 'image' || this.isImageRequest(aiContent)) {
            const imageResponse = await this.handleImageRequest(
                sessionId,
                messageText || 'Generate an image',
                model,
            );
            onChunk(imageResponse);
            return { sessionId, userMessageId: userMsg.id };
        }

        // ✅ Research Mode - Derin Araştırma
        if (mode === 'research') {
            return this.handleResearchMode(
                sessionId,
                userId,
                messageText || '',
                onChunk,
                model,
                userMsg.id,
            );
        }

        // ✅ Agent Mode
        if (mode === 'agent') {
            return this.handleAgentMode(
                sessionId,
                userId,
                messageText || '',
                onChunk,
                model,
                userMsg.id,
            );
        }

        if (mode === 'web') {
            this.logger.log(`[Web Mode] Starting web search for: ${messageText}`);
            
            // Search API'yi çağır (Serper veya Bing)
            onChunk('🔍 **در حال جستجو در وب...**\n\n');
            const searchResult = await this.search.search(messageText || '');
            
            if (searchResult.type === 'results' && searchResult.results.length > 0) {
                // Gerçek arama sonuçları var - AI ile özetle
                this.logger.log(`[Web Mode] Found ${searchResult.results.length} results, summarizing with AI`);
                
                const searchContext = searchResult.results
                    .map((r: any, idx: number) => `[${idx + 1}] **${r.name}**\nÖzet: ${r.snippet}\nLink: ${r.url}`)
                    .join('\n\n');
                
                const webPrompt = `Sen bir web araştırma asistanısın. Kullanıcının sorusu: "${messageText}"

Aşağıdaki web arama sonuçlarını kullanarak TÜRKÇE cevap ver:

${searchContext}

ÖNEMLİ KURALLAR:
1. Cevabını düzgün paragraflar halinde yaz
2. Linkleri MUTLAKA şu markdown formatında ver: [Site Adı](https://url.com)
3. Her kaynağı cümle içinde doğal bir şekilde linkle
4. Özet bilgi ver, sonra kaynaklara link at
5. Fazla teknik detaya girme, kullanıcı dostu ol

Örnek format:
"Son dakika haberlerine göre... Detaylı bilgi için [TRT Haber](https://www.trthaber.com) ve [Habertürk](https://www.haberturk.com) sitelerini ziyaret edebilirsiniz."`;

                const history = await this.getRecentMessages(sessionId);
                const chatMessages: ChatMessage[] = [
                    ...history.slice(-4).map((msg) => ({
                        role: msg.role as 'user' | 'assistant',
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                    })),
                    { role: 'user' as const, content: webPrompt }
                ];

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
                        content: '🔍 **در حال جستجو در وب...**\n\n' + fullResponse,
                        model: model,
                    })
                    .returning();
                await this.touchSession(sessionId);
                return {
                    sessionId,
                    userMessageId: userMsg.id,
                    assistantMessageId: assistantMsg.id,
                };
            } else {
                // API yok veya sonuç yok - sadece AI ile cevap ver (kullanıcıya bilgi verme)
                this.logger.log(`[Web Mode] No search results, using AI knowledge`);
                
                const webPrompt = `Kullanıcının sorusu: "${messageText}"

Web araması yapılamadı ama bilgilerinle yardımcı ol. TÜRKÇE cevap ver.
Eğer güncel bilgi gerektiren bir soruysa, kullanıcıya ilgili siteleri önererek markdown formatında linkle:
Örnek: "Güncel haberler için [TRT Haber](https://www.trthaber.com) sitesini ziyaret edebilirsiniz."`;

                const history = await this.getRecentMessages(sessionId);
                const chatMessages: ChatMessage[] = [
                    ...history.slice(-4).map((msg) => ({
                        role: msg.role as 'user' | 'assistant',
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                    })),
                    { role: 'user' as const, content: webPrompt }
                ];

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
                        content: '🔍 **در حال جستجو در وب...**\n\n' + fullResponse,
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
        }

        // Normal chat mode
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

        // Soft delete - veritabanından silme, sadece işaretle
        await this.db
            .update(sessions)
            .set({ 
                isDeleted: true, 
                deletedAt: new Date() 
            })
            .where(eq(sessions.id, sessionId));

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

    // ✅ Otomatik session title güncelleme (ilk user mesajından)
    private async autoUpdateSessionTitle(sessionId: string, messageContent: any) {
        try {
            // Session'ın mevcut title'ını kontrol et
            const [session] = await this.db
                .select()
                .from(sessions)
                .where(eq(sessions.id, sessionId));
            
            if (!session) return;
            
            // Eğer title zaten özelleştirilmişse (default değilse) güncelleme
            const defaultTitles = ['New Chat', 'Yeni Sohbet', 'گفتگوی جدید', ''];
            if (session.title && !defaultTitles.includes(session.title.trim())) {
                return; // Zaten özel bir title var
            }
            
            // Mesaj sayısını kontrol et - sadece ilk mesajda güncelle
            const messageCount = await this.db
                .select()
                .from(messages)
                .where(eq(messages.sessionId, sessionId));
            
            if (messageCount.length > 2) return; // İlk mesaj değil
            
            // Title oluştur
            let titleText = '';
            if (typeof messageContent === 'string') {
                titleText = messageContent;
            } else if (Array.isArray(messageContent)) {
                const textPart = messageContent.find((p: any) => p.type === 'text');
                titleText = textPart?.text || 'Image';
            }
            
            // Title'ı kısalt
            const newTitle = titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '');
            
            // Güncelle
            await this.db
                .update(sessions)
                .set({ title: newTitle })
                .where(eq(sessions.id, sessionId));
                
        } catch (error) {
            // Title güncellemesi kritik değil, hata olursa sessizce devam et
            this.logger.warn(`[autoUpdateSessionTitle] Failed to update title: ${error}`);
        }
    }

    private async ensureSessionOwnership(sessionId: string, userId: number) {
        // Debug logları sadece development'ta göster
        const isVerbose = process.env.DEBUG_SESSIONS === 'true';
        
        if (isVerbose) {
            this.logger.debug(`Checking session ${sessionId} for user ${userId}...`);
        }
        
        const [session] = await this.db
            .select({
                id: sessions.id,
                ownerId: sessions.userId,
            })
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        if (!session) {
            this.logger.error(`Session ${sessionId} not found in database`);
            throw new Error('Session not found or unauthorized');
        }

        if (isVerbose) {
            this.logger.debug(`Found session ${sessionId}, owner: ${session.ownerId}, requesting user: ${userId}`);
        }

        // Normalize both to numbers for comparison (handle potential type mismatches)
        const normalizedOwnerId = typeof session.ownerId === 'string' ? parseInt(session.ownerId, 10) : session.ownerId;
        const normalizedUserId = typeof userId === 'string' ? parseInt(userId as any, 10) : userId;

        if (normalizedOwnerId !== normalizedUserId) {
            this.logger.error(`User ${normalizedUserId} doesn't own session ${sessionId} (owner: ${normalizedOwnerId})`);
            throw new Error('Session not found or unauthorized');
        }
        
        if (isVerbose) {
            this.logger.debug(`Ownership verified for session ${sessionId}`);
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

    /**
     * ✅ ChatGPT tarzı: Önce AI yanıtı al, sonra session oluştur
     * Session sadece AI başarıyla yanıt verdikten sonra oluşturulur
     */
    private async handleNewSessionWithAI(
        userId: number,
        userMessage: any,
        onChunk: (chunk: string) => void,
        model: string,
        mode?: string,
    ): Promise<{
        sessionId: string;
        userMessageId: number;
        assistantMessageId?: number;
        isNewSession: boolean;
    }> {
        // PDF ve dosyaları işle - displayContent DB için, aiContent AI için
        const { displayContent, aiContent } = await this.processMessageContent(userMessage);
        
        let messageText = '';
        if (typeof aiContent === 'string') {
            messageText = aiContent;
        } else if (Array.isArray(aiContent)) {
            messageText = aiContent
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join(' ');
        }

        // ✅ ÖNCE AI yanıtını al (session oluşturmadan)
        let fullResponse = '';
        
        // Chat mesajlarını hazırla (tek mesajlık geçmiş) - AI content ile
        const chatMessages: ChatMessage[] = [
            { role: 'user' as const, content: aiContent as any }
        ];

        try {
            await this.openai.streamChat(
                chatMessages,
                (chunk) => {
                    fullResponse += chunk;
                    onChunk(chunk);
                },
                model,
            );
        } catch (error) {
            this.logger.error('[handleNewSessionWithAI] AI streaming failed:', error);
            throw error;
        }

        // ✅ AI yanıtı başarılı - şimdi session oluştur
        const [newSession] = await this.db
            .insert(sessions)
            .values({
                userId,
                title: 'گفتگوی جدید', // Geçici title (Farsi), AI ile güncellenecek
            })
            .returning();

        const sessionId = newSession.id;
        this.logger.log(`[handleNewSessionWithAI] Created new session ${sessionId} after AI response`);

        // Mesajları kaydet - displayContent (PDF içeriği olmadan)
        const contentToStore = Array.isArray(displayContent) ? JSON.stringify(displayContent) : displayContent;

        const [userMsg] = await this.db
            .insert(messages)
            .values({
                sessionId,
                role: 'user',
                content: contentToStore,
            })
            .returning();

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
        
        // ✅ AI ile başlık oluştur
        await this.autoGenerateTitle(sessionId);

        return {
            sessionId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            isNewSession: true,
        };
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
            'gpt-5.2-auto',
            'gpt-5.2-instant',
            'gpt-5.2-thinking',
            'gpt-5.2-pro',
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
                (session.title !== 'New Chat' && session.title !== 'Yeni Sohbet' && session.title !== 'گفتگوی جدید')
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

            // ✅ ChatGPT tarzı AI ile başlık üret
            let title = await this.generateTitleWithAI(messageText);
            
            // AI başarısız olursa fallback
            if (!title || title.length < 2) {
                title = messageText.substring(0, 50);
                if (messageText.length > 50) {
                    title = title.substring(0, title.lastIndexOf(' ')) || title;
                    title += '...';
                }
            }

            await this.db
                .update(sessions)
                .set({ title })
                .where(eq(sessions.id, sessionId));
                
            this.logger.log(`[AutoTitle] Session ${sessionId}: "${title}"`);
        } catch (error) {
            this.logger.error('Auto title generation failed:', error);
        }
    }

    // ✅ ChatGPT tarzı AI ile başlık üretme
    private async generateTitleWithAI(userMessage: string): Promise<string> {
        try {
            // ChatGPT'nin kullandığı basit prompt
            const prompt = `Generate a short title (2-5 words max) for this conversation. 
Rules:
- Use the same language as the user's message
- No quotes, no punctuation at the end
- Just output the title, nothing else

User message: "${userMessage.substring(0, 200)}"`;

            const response = await this.openai.chat(
                [{ role: 'user', content: prompt }],
                'gpt-4o-mini',
            );

            let title = (response || '').trim()
                .replace(/^["']|["']$/g, '')  // Tırnak kaldır
                .replace(/\.+$/, '')           // Sondaki nokta kaldır
                .replace(/^Title:\s*/i, '')    // "Title:" prefix kaldır
                .trim();

            // Max 50 karakter
            if (title.length > 50) {
                title = title.substring(0, 47) + '...';
            }

            return title;
        } catch (error) {
            this.logger.error('[generateTitleWithAI] Error:', error.message);
            return '';
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

    // ✅ Research Mode - Derin Araştırma (Web araması + AI analizi)
    private async handleResearchMode(
        sessionId: string,
        userId: number,
        query: string,
        onChunk: (chunk: string) => void,
        model: string,
        userMsgId: number,
    ): Promise<{ sessionId: string; userMessageId: number; assistantMessageId?: number }> {
        this.logger.log(`[Research Mode] Starting deep research for: ${query}`);

        // 1. Web araması yap
        const bingKey = this.configService.get<string>('BING_API_KEY');
        let searchContext = '';
        
        if (bingKey) {
            try {
                onChunk('🔍 **در حال جستجوی وب...**\n\n');
                
                const searchResult = await this.search.search(query);
                
                if (searchResult.type === 'results' && searchResult.results?.length > 0) {
                    // En iyi 5 sonucu al
                    const topResults = searchResult.results.slice(0, 5);
                    searchContext = topResults.map((r: any, idx: number) => 
                        `**منبع ${idx + 1}:** ${r.name}\n${r.snippet}\nلینک: ${r.url}`
                    ).join('\n\n');
                    
                    onChunk(`📚 **${topResults.length} منبع یافت شد**\n\n`);
                }
            } catch (error) {
                this.logger.error('[Research Mode] Search error:', error);
                onChunk('⚠️ خطا در جستجوی وب. در حال ادامه با اطلاعات موجود...\n\n');
            }
        }

        // 2. AI ile derin analiz
        onChunk('🧠 **در حال تحلیل عمیق...**\n\n---\n\n');
        
        const researchPrompt = `شما یک محقق متخصص هستید. یک گزارش تحقیقاتی جامع و دقیق در مورد موضوع زیر تهیه کنید.

**سوال/موضوع:** ${query}

${searchContext ? `**اطلاعات جمع‌آوری شده از وب:**\n${searchContext}\n\n` : ''}

**لطفاً گزارش خود را با ساختار زیر ارائه دهید:**
1. **خلاصه اجرایی** - یک پاراگراف مختصر
2. **تحلیل عمیق** - بررسی جزئیات و نکات کلیدی
3. **یافته‌های اصلی** - نکات مهم به صورت لیست
4. **نتیجه‌گیری** - جمع‌بندی نهایی
${searchContext ? '5. **منابع** - لیست منابع استفاده شده' : ''}

از فرمت Markdown استفاده کنید. پاسخ باید جامع، دقیق و مستند باشد.`;

        const history = await this.getRecentMessages(sessionId);
        const chatMessages: ChatMessage[] = [
            ...history.map((msg) => ({
                role: msg.role as 'user' | 'assistant',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            })),
            { role: 'user' as const, content: researchPrompt }
        ];

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

        return {
            sessionId,
            userMessageId: userMsgId,
            assistantMessageId: assistantMsg.id,
        };
    }

    // ✅ Agent Mode - Görev yürütme
    private async handleAgentMode(
        sessionId: string,
        userId: number,
        task: string,
        onChunk: (chunk: string) => void,
        model: string,
        userMsgId: number,
    ): Promise<{ sessionId: string; userMessageId: number; assistantMessageId?: number }> {
        this.logger.log(`[Agent Mode] Starting task execution for: ${task}`);

        // Detect language from task
        const isTurkish = /[ğüşıöçĞÜŞİÖÇ]/.test(task) || /\b(bir|ve|için|ile|bu|ne|nasıl|neden|kim|nerede|yap|et|ol|de|da)\b/i.test(task);
        const isPersian = /[\u0600-\u06FF]/.test(task);

        let activatedMsg: string;
        let analyzingMsg: string;
        let agentPrompt: string;

        if (isPersian) {
            // Farsça
            activatedMsg = '🤖 **حالت ایجنت فعال شد**\n\n';
            analyzingMsg = '📋 **در حال تحلیل وظیفه...**\n\n';
            agentPrompt = `شما یک ایجنت هوشمند هستید که می‌توانید وظایف پیچیده را به مراحل کوچک‌تر تقسیم کرده و آنها را اجرا کنید.

**وظیفه درخواستی:** ${task}

**لطفاً با ساختار زیر پاسخ دهید:**

## 📌 تحلیل وظیفه
توضیح مختصر در مورد وظیفه و اهداف آن

## 📋 برنامه اجرایی
### مرحله 1: [عنوان]
- جزئیات اجرا
- خروجی مورد انتظار

### مرحله 2: [عنوان]
- جزئیات اجرا
- خروجی مورد انتظار

(و به همین ترتیب...)

## ⚡ اجرای مراحل
اجرای مرحله به مرحله وظیفه با توضیحات

## ✅ نتیجه نهایی
خلاصه کار انجام شده و خروجی نهایی

---
*توجه: من یک ایجنت AI هستم و فقط می‌توانم وظایف متنی و تحلیلی را انجام دهم.*`;
        } else if (isTurkish) {
            // Türkçe
            activatedMsg = '🤖 **Agent Modu Aktif**\n\n';
            analyzingMsg = '📋 **Görev analiz ediliyor...**\n\n';
            agentPrompt = `Sen karmaşık görevleri küçük adımlara bölebilen ve bunları yürütebilen akıllı bir ajansın.

**İstenen görev:** ${task}

**Lütfen aşağıdaki yapıyla yanıt ver:**

## 📌 Görev Analizi
Görev ve hedefleri hakkında kısa açıklama

## 📋 Yürütme Planı
### Adım 1: [Başlık]
- Uygulama detayları
- Beklenen çıktı

### Adım 2: [Başlık]
- Uygulama detayları
- Beklenen çıktı

(ve devamı...)

## ⚡ Adımların Yürütülmesi
Görevin adım adım yürütülmesi ve açıklamalar

## ✅ Sonuç
Yapılan işin özeti ve nihai çıktı

---
*Not: Ben bir AI ajanıyım ve sadece metin tabanlı ve analitik görevleri yapabilirim.*`;
        } else {
            // İngilizce (varsayılan)
            activatedMsg = '🤖 **Agent Mode Activated**\n\n';
            analyzingMsg = '📋 **Analyzing task...**\n\n';
            agentPrompt = `You are an intelligent agent that can break down complex tasks into smaller steps and execute them.

**Requested task:** ${task}

**Please respond with the following structure:**

## 📌 Task Analysis
Brief explanation of the task and its objectives

## 📋 Execution Plan
### Step 1: [Title]
- Implementation details
- Expected output

### Step 2: [Title]
- Implementation details
- Expected output

(and so on...)

## ⚡ Step Execution
Step-by-step execution of the task with explanations

## ✅ Final Result
Summary of the work done and final output

---
*Note: I am an AI agent and can only perform text-based and analytical tasks.*`;
        }

        onChunk(activatedMsg);
        onChunk(analyzingMsg);

        const history = await this.getRecentMessages(sessionId);
        const chatMessages: ChatMessage[] = [
            ...history.map((msg) => ({
                role: msg.role as 'user' | 'assistant',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            })),
            { role: 'user' as const, content: agentPrompt }
        ];

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

        return {
            sessionId,
            userMessageId: userMsgId,
            assistantMessageId: assistantMsg.id,
        };
    }
}
