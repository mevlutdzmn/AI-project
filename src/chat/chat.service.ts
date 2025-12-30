/**
 * Chat Service (Refactored)
 * 
 * Main chat orchestration service. Delegates to specialized services:
 * - ChatImageService: Image generation and editing
 * - ChatPdfService: PDF processing
 * - ChatResearchService: Deep research and web search
 * - ChatTitleService: AI-generated titles
 * - ChatVoiceService: Voice message handling
 * 
 * Following SOLID Principles:
 * - S: Each service has a single responsibility
 * - O: Open for extension (new modes can be added)
 * - L: Services implement consistent interfaces
 * - I: Interface segregation via specialized services
 * - D: Depends on abstractions (injectable services)
 * 
 * @module chat/chat.service
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { sessions, messages } from '../database/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { OpenAIAdapter, ChatMessage } from '../ai/adapters/openai.adapter';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from '../memory/memory.service';
import { UsageService } from '../usage/usage.service';

// Specialized services
import {
  ChatImageService,
  ChatPdfService,
  ChatResearchService,
  ChatTitleService,
  ChatVoiceService,
} from './services';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private openai: OpenAIAdapter,
    private usersService: UsersService,
    private configService: ConfigService,
    private memoryService: MemoryService,
    private usageService: UsageService,
    // Specialized services (SOLID - Dependency Injection)
    private imageService: ChatImageService,
    private pdfService: ChatPdfService,
    private researchService: ChatResearchService,
    private titleService: ChatTitleService,
    private voiceService: ChatVoiceService,
  ) {}

  // ============================================
  // Session Management
  // ============================================

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
          eq(sessions.archived, false),
        ),
      )
      .orderBy(desc(sessions.pinned), desc(sessions.updatedAt));
  }

  async getPinnedSessions(userId: number) {
    return this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.isDeleted, false),
          eq(sessions.pinned, true),
        ),
      )
      .orderBy(desc(sessions.updatedAt));
  }

  async getArchivedSessions(userId: number) {
    return this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.isDeleted, false),
          eq(sessions.archived, true),
        ),
      )
      .orderBy(desc(sessions.updatedAt));
  }

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

  async moveSessionToFolder(
    sessionId: string,
    userId: number,
    folderId: number | null,
  ) {
    await this.ensureSessionOwnership(sessionId, userId);

    const [updated] = await this.db
      .update(sessions)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated;
  }

  async deleteSession(sessionId: string, userId: number) {
    await this.ensureSessionOwnership(sessionId, userId);

    await this.db
      .update(sessions)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
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

  // ============================================
  // Message Management
  // ============================================

  async getSessionMessages(sessionId: string, userId: number) {
    await this.ensureSessionOwnership(sessionId, userId);

    return this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);
  }

  async getSessionMessagesPaginated(
    sessionId: string,
    userId: number,
    limit: number = 10,
    beforeId?: number,
  ): Promise<{ messages: any[]; hasMore: boolean }> {
    await this.ensureSessionOwnership(sessionId, userId);

    const conditions = [eq(messages.sessionId, sessionId)];

    if (beforeId) {
      conditions.push(sql`${messages.id} < ${beforeId}`);
    }

    const result = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.id))
      .limit(limit + 1);

    const hasMore = result.length > limit;
    const messagesToReturn = hasMore ? result.slice(0, limit) : result;

    return {
      messages: messagesToReturn.reverse(),
      hasMore,
    };
  }

  /**
   * Get messages around a specific message ID (for search jump-to)
   * Returns messages before and after the target message
   */
  async getMessagesAroundId(
    sessionId: string,
    userId: number,
    targetMessageId: number,
    before: number = 25,
    after: number = 25,
  ): Promise<{ messages: any[]; targetIndex: number; hasMoreBefore: boolean; hasMoreAfter: boolean }> {
    await this.ensureSessionOwnership(sessionId, userId);

    // Get messages before target (including target)
    const messagesBefore = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          sql`${messages.id} <= ${targetMessageId}`
        )
      )
      .orderBy(desc(messages.id))
      .limit(before + 1);

    // Get messages after target
    const messagesAfter = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          sql`${messages.id} > ${targetMessageId}`
        )
      )
      .orderBy(messages.id)
      .limit(after + 1);

    const hasMoreBefore = messagesBefore.length > before;
    const hasMoreAfter = messagesAfter.length > after;

    // Combine and sort
    const beforeMsgs = hasMoreBefore ? messagesBefore.slice(0, before) : messagesBefore;
    const afterMsgs = hasMoreAfter ? messagesAfter.slice(0, after) : messagesAfter;

    const allMessages = [...beforeMsgs.reverse(), ...afterMsgs];
    const targetIndex = allMessages.findIndex(m => m.id === targetMessageId);

    return {
      messages: allMessages,
      targetIndex,
      hasMoreBefore,
      hasMoreAfter,
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

  // ============================================
  // Voice Message (Delegate to VoiceService)
  // ============================================

  async saveVoiceMessage(
    sessionId: string,
    userId: number,
    content: string,
    role: 'user' | 'assistant',
  ): Promise<number> {
    return this.voiceService.saveVoiceMessage(sessionId, userId, content, role);
  }

  // ============================================
  // Send Message (Non-Streaming)
  // ============================================

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

    if (!userMessage || (typeof userMessage === 'string' && userMessage.trim() === '')) {
      throw new Error('Message content cannot be empty');
    }

    // Process PDF and files
    const { displayContent, aiContent } = await this.pdfService.processMessageContent(userMessage);

    const contentToStore = Array.isArray(displayContent)
      ? JSON.stringify(displayContent)
      : displayContent;

    const [userMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'user',
        content: contentToStore,
        model,
      })
      .returning();

    // Auto title for first message
    const messageCount = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    if (messageCount.length === 1) {
      await this.titleService.autoUpdateSessionTitle(sessionId, displayContent);
    }

    const messageText = this.pdfService.extractMessageText(aiContent);

    // Handle explicit image mode (when user selects image mode from UI)
    if (mode === 'image') {
      const imageResponse = await this.imageService.handleImageRequest(
        sessionId,
        messageText || 'Generate an image',
        model,
        false,
      );
      return { response: imageResponse, userMessageId: userMsg.id };
    }

    // ✅ ChatGPT tarzı: Keyword ile görsel isteği algıla
    // "kedi çiz", "resim yap" gibi isteklerde otomatik görsel moduna geç
    // Bu, mode === 'chat' iken bile görsel oluşturmayı sağlar
    if (this.imageService.isImageRequest(aiContent)) {
      const imageResponse = await this.imageService.handleImageRequest(
        sessionId,
        messageText || 'Generate an image',
        model,
        false,
      );
      return { response: imageResponse, userMessageId: userMsg.id };
    }

    // ✅ Multi-turn image editing: "insan binsin", "daha büyük olsun" gibi kısa edit istekleri
    // Önceki görsel varsa, edit olarak işle
    if (this.imageService.isImageEditFollowUp(aiContent)) {
      const previousImageContext = await this.imageService.findPreviousImageContext(sessionId);
      if (previousImageContext) {
        const imageResponse = await this.imageService.handleImageRequest(
          sessionId,
          messageText || 'Edit the image',
          model,
          true, // isEditRequest = true
          previousImageContext,
        );
        return { response: imageResponse, userMessageId: userMsg.id };
      }
    }

    // Normal chat
    const history = await this.getRecentMessages(sessionId);
    const chatMessages: ChatMessage[] = history.map((msg) => {
      let content: any = msg.content;
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object') content = parsed;
        } catch (e) {}
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content,
      };
    });

    const { content: aiResponse, usage } = await this.openai.chat(chatMessages, model, undefined, sessionId);

    if (usage) {
      await this.usageService.logUsage(
        userId,
        model,
        usage.promptTokens,
        usage.completionTokens,
        sessionId,
      );
    }

    const [assistantMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'assistant',
        content: aiResponse,
        model,
      })
      .returning();

    await this.touchSession(sessionId);

    return {
      response: aiResponse,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
    };
  }

  // ============================================
  // Send Message Stream
  // ============================================

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

    // No session - create after AI response (ChatGPT style)
    if (!sessionId) {
      return this.handleNewSessionWithAI(userId, userMessage, onChunk, model, mode);
    }

    await this.ensureSessionOwnership(sessionId, userId);

    if (!userMessage || (typeof userMessage === 'string' && userMessage.trim() === '')) {
      throw new Error('Message content cannot be empty');
    }

    // Process PDF and files
    const { displayContent, aiContent } = await this.pdfService.processMessageContent(userMessage);

    const contentToStore = Array.isArray(displayContent)
      ? JSON.stringify(displayContent)
      : displayContent;

    const [userMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'user',
        content: contentToStore,
      })
      .returning();

    // Auto generate title
    this.titleService.autoGenerateTitle(sessionId);

    const messageText = this.pdfService.extractMessageText(aiContent);

    // Handle explicit image mode (when user selects image mode from UI)
    if (mode === 'image') {
      const previousImageContext = await this.imageService.findPreviousImageContext(sessionId);
      const imageResponse = await this.imageService.handleImageRequest(
        sessionId,
        messageText || 'Generate an image',
        model,
        false,
        previousImageContext,
      );
      onChunk(imageResponse);
      return { sessionId, userMessageId: userMsg.id };
    }

    // ✅ ChatGPT tarzı: Keyword ile görsel isteği algıla
    // "kedi çiz", "resim yap" gibi isteklerde otomatik görsel moduna geç
    if (this.imageService.isImageRequest(aiContent)) {
      const imageResponse = await this.imageService.handleImageRequest(
        sessionId,
        messageText || 'Generate an image',
        model,
        false,
      );
      onChunk(imageResponse);
      return { sessionId, userMessageId: userMsg.id };
    }

    // ✅ Multi-turn image editing: "insan binsin", "daha büyük olsun" gibi kısa edit istekleri
    // Önceki görsel varsa, edit olarak işle
    if (this.imageService.isImageEditFollowUp(aiContent)) {
      const previousImageContext = await this.imageService.findPreviousImageContext(sessionId);
      if (previousImageContext) {
        const imageResponse = await this.imageService.handleImageRequest(
          sessionId,
          messageText || 'Edit the image',
          model,
          true, // isEditRequest = true
          previousImageContext,
        );
        onChunk(imageResponse);
        return { sessionId, userMessageId: userMsg.id };
      }
    }

    // Handle research mode
    if (mode === 'research') {
      return this.researchService.handleResearchMode(
        sessionId,
        userId,
        messageText || '',
        onChunk,
        model,
        userMsg.id,
      );
    }

    // Handle agent mode
    if (mode === 'agent') {
      return this.researchService.handleAgentMode(
        sessionId,
        userId,
        messageText || '',
        onChunk,
        model,
        userMsg.id,
      );
    }

    // Handle web mode
    if (mode === 'web') {
      const webResponse = await this.researchService.handleWebMode(
        sessionId,
        messageText || '',
        onChunk,
        model,
      );

      const [assistantMsg] = await this.db
        .insert(messages)
        .values({
          sessionId,
          role: 'assistant',
          content: webResponse,
          model,
        })
        .returning();

      await this.touchSession(sessionId);
      return {
        sessionId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
      };
    }

    // Normal chat mode
    const history = await this.getRecentMessages(sessionId);
    const chatMessages: ChatMessage[] = history.map((msg) => {
      let content: any = msg.content;
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object') content = parsed;
        } catch (e) {}
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content,
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
      sessionId, // ✅ SECURITY: Pass sessionId for user-scoped context
    );

    const [assistantMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'assistant',
        content: fullResponse,
        model,
      })
      .returning();

    await this.touchSession(sessionId);
    await this.titleService.autoGenerateTitle(sessionId);

    return {
      sessionId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
    };
  }

  // ============================================
  // Deep Research (Delegate)
  // ============================================

  async startDeepResearch(prompt: string, sessionId?: string, model?: string) {
    return this.researchService.startDeepResearch(prompt, sessionId, model);
  }

  async getDeepResearchStatus(id: string) {
    return this.researchService.getDeepResearchStatus(id);
  }

  async saveDeepResearchMessages(
    sessionId: string,
    userId: number,
    userMessage: string,
    assistantMessage: string,
  ) {
    return this.researchService.saveDeepResearchMessages(
      sessionId,
      userId,
      userMessage,
      assistantMessage,
    );
  }

  // ============================================
  // Title Generation (Delegate)
  // ============================================

  async generateChatTitle(
    message?: string,
    messageList?: Array<{ role: string; content: string }>,
  ) {
    return this.titleService.generateChatTitle(message, messageList);
  }

  // ============================================
  // Voice/STT (Delegate)
  // ============================================

  async cleanupSTTText(text: string, language?: string) {
    return this.voiceService.cleanupSTTText(text, language);
  }

  async quickChatResponse(message: string, systemPrompt?: string) {
    return this.voiceService.quickChatResponse(message, systemPrompt);
  }

  // ============================================
  // Regenerate & Edit
  // ============================================

  async regenerateLastMessage(
    sessionId: string,
    userId: number,
    model?: string,
  ) {
    await this.ensureSessionOwnership(sessionId, userId);
    await this.validatePremiumAccess(userId, model || 'gpt-4o');

    const history = await this.getRecentMessages(sessionId, 10);
    if (history.length === 0) {
      throw new Error('No messages to regenerate');
    }

    const lastAssistantIndex = history
      .map((m, i) => ({ m, i }))
      .reverse()
      .find((x) => x.m.role === 'assistant')?.i;

    if (lastAssistantIndex !== undefined && lastAssistantIndex >= 0) {
      await this.db
        .delete(messages)
        .where(eq(messages.id, history[lastAssistantIndex].id));
    }

    const chatMessages: ChatMessage[] = history
      .slice(0, lastAssistantIndex || history.length)
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as any,
      }));

    const { content: response, usage } = await this.openai.chat(
      chatMessages,
      model || 'gpt-4o',
      undefined,
      sessionId, // ✅ SECURITY: Pass sessionId for user-scoped context
    );

    if (usage) {
      await this.usageService.logUsage(
        userId,
        model || 'gpt-4o',
        usage.promptTokens,
        usage.completionTokens,
        sessionId,
      );
    }

    await this.db.insert(messages).values({
      sessionId,
      role: 'assistant',
      content: response,
      model: model || 'gpt-4o',
    });

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

  // ============================================
  // Private Helper Methods
  // ============================================

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
    const { displayContent, aiContent } = await this.pdfService.processMessageContent(userMessage);

    // Get AI response first (without session)
    let fullResponse = '';
    const chatMessages: ChatMessage[] = [
      { role: 'user' as const, content: aiContent as any },
    ];

    try {
      await this.openai.streamChat(
        chatMessages,
        (chunk) => {
          fullResponse += chunk;
          onChunk(chunk);
        },
        model,
        undefined, // sessionId - new session so no context yet
      );
    } catch (error) {
      this.logger.error('[handleNewSessionWithAI] AI streaming failed:', error);
      throw error;
    }

    // AI success - create session now
    const [newSession] = await this.db
      .insert(sessions)
      .values({
        userId,
        title: 'گفتگوی جدید',
      })
      .returning();

    const sessionId = newSession.id;
    this.logger.log(
      `[handleNewSessionWithAI] Created new session ${sessionId} after AI response`,
    );

    // Save messages
    const contentToStore = Array.isArray(displayContent)
      ? JSON.stringify(displayContent)
      : displayContent;

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
        model,
      })
      .returning();

    await this.touchSession(sessionId);
    await this.titleService.autoGenerateTitle(sessionId);

    return {
      sessionId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      isNewSession: true,
    };
  }

  private async ensureSessionOwnership(sessionId: string, userId: number) {
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

    const normalizedOwnerId =
      typeof session.ownerId === 'string'
        ? parseInt(session.ownerId, 10)
        : session.ownerId;
    const normalizedUserId =
      typeof userId === 'string' ? parseInt(userId as any, 10) : userId;

    if (normalizedOwnerId !== normalizedUserId) {
      this.logger.error(
        `User ${normalizedUserId} doesn't own session ${sessionId} (owner: ${normalizedOwnerId})`,
      );
      throw new Error('Session not found or unauthorized');
    }
  }

  private async touchSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
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

    const isDevelopment =
      process.env.NODE_ENV === 'development' || !process.env.VERCEL;

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
  }
}
