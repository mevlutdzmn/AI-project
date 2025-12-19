/**
 * Chat Title Service
 * 
 * Handles AI-generated title operations:
 * - Auto-generate session title from first message
 * - Generate title from conversation
 * 
 * @module chat/services/chat-title.service
 * @description Single Responsibility: Only handles title generation
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { sessions, messages } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { OpenAIAdapter } from '../../ai/adapters/openai.adapter';

@Injectable()
export class ChatTitleService {
  private readonly logger = new Logger(ChatTitleService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private openai: OpenAIAdapter,
  ) {}

  /**
   * Auto-generate title for a session using AI
   * Only runs for sessions with default titles
   */
  async autoGenerateTitle(sessionId: string): Promise<void> {
    try {
      const [session] = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      if (
        !session ||
        (session.title !== 'New Chat' &&
          session.title !== 'Yeni Sohbet' &&
          session.title !== 'گفتگوی جدید')
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
        } catch (e) {}
      }

      const messageText =
        typeof content === 'string' ? content : JSON.stringify(content);

      // Generate title with AI
      let title = await this.generateTitleWithAI(messageText);

      // Fallback if AI fails
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

  /**
   * Generate title from conversation using AI
   * Used by frontend proxy
   */
  async generateChatTitle(
    message?: string,
    messageList?: Array<{ role: string; content: string }>,
  ): Promise<{ title: string }> {
    try {
      const conversationText = messageList
        ? messageList.map((m) => `${m.role}: ${m.content}`).join('\n')
        : message;

      if (!conversationText) {
        return { title: 'گفتگوی جدید' };
      }

      const title = await this.generateTitleWithAI(conversationText);
      return { title: title || 'گفتگوی جدید' };
    } catch (error) {
      this.logger.error('[generateChatTitle] Error:', error.message);
      return { title: 'گفتگوی جدید' };
    }
  }

  /**
   * Generate short title using AI - ChatGPT style
   */
  async generateTitleWithAI(userMessage: string): Promise<string> {
    try {
      const prompt = `Generate a short title (2-5 words max) for this conversation. 
Rules:
- Use the same language as the user's message
- No quotes, no punctuation at the end
- Just output the title, nothing else

User message: "${userMessage.substring(0, 200)}"`;

      const { content: response } = await this.openai.chat(
        [{ role: 'user', content: prompt }],
        'gpt-4o-mini',
      );

      let title = (response || '')
        .trim()
        .replace(/^["']|["']$/g, '') // Remove quotes
        .replace(/\.+$/, '') // Remove trailing dots
        .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
        .trim();

      // Max 50 characters
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }

      return title;
    } catch (error) {
      this.logger.error('[generateTitleWithAI] Error:', error.message);
      return '';
    }
  }

  /**
   * Update session title manually
   */
  async updateTitle(sessionId: string, title: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Auto-update title from first user message (simple version)
   */
  async autoUpdateSessionTitle(sessionId: string, messageContent: any): Promise<void> {
    try {
      const [session] = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      if (!session) return;

      // Don't update if title is already customized
      const defaultTitles = ['New Chat', 'Yeni Sohbet', 'گفتگوی جدید', ''];
      if (session.title && !defaultTitles.includes(session.title.trim())) {
        return;
      }

      // Only update on first message
      const messageCount = await this.db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId));

      if (messageCount.length > 2) return;

      // Create title
      let titleText = '';
      if (typeof messageContent === 'string') {
        titleText = messageContent;
      } else if (Array.isArray(messageContent)) {
        const textPart = messageContent.find((p: any) => p.type === 'text');
        titleText = textPart?.text || 'Image';
      }

      const newTitle =
        titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '');

      await this.db
        .update(sessions)
        .set({ title: newTitle })
        .where(eq(sessions.id, sessionId));
    } catch (error) {
      this.logger.warn(
        `[autoUpdateSessionTitle] Failed to update title: ${error}`,
      );
    }
  }
}
