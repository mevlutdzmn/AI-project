/**
 * Chat Voice Service
 * 
 * Handles voice-related operations:
 * - STT cleanup with LLM
 * - Voice message saving
 * - Quick chat responses for voice
 * 
 * @module chat/services/chat-voice.service
 * @description Single Responsibility: Only handles voice operations
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { messages, sessions } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { OpenAIAdapter } from '../../ai/adapters/openai.adapter';

@Injectable()
export class ChatVoiceService {
  private readonly logger = new Logger(ChatVoiceService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private openai: OpenAIAdapter,
  ) {}

  /**
   * Save voice transcript as message
   * Used by Realtime Voice API - no AI call needed
   */
  async saveVoiceMessage(
    sessionId: string,
    userId: number,
    content: string,
    role: 'user' | 'assistant',
  ): Promise<number> {
    // Verify session ownership
    const [session] = await this.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    const [saved] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role,
        content,
        inputType: 'voice',
        model: 'gpt-4o-realtime',
      })
      .returning({ id: messages.id });

    // Touch session to update timestamp
    await this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    this.logger.debug(`Voice message saved: ${saved.id} (${role})`);
    return saved.id;
  }

  /**
   * Cleanup STT transcript with LLM
   * Fixes speech-to-text errors while preserving meaning
   */
  async cleanupSTTText(
    text: string,
    language?: string,
  ): Promise<{ cleaned: string; original: string; wasFixed: boolean }> {
    try {
      if (!text || text.length < 5) {
        return { cleaned: text, original: text, wasFixed: false };
      }

      const { content: response } = await this.openai.chat(
        [
          {
            role: 'system',
            content: `You are a speech-to-text error corrector. Your ONLY job is to fix transcription errors.

RULES:
1. Fix spelling mistakes caused by speech recognition
2. Fix grammar errors that don't make sense
3. Keep the EXACT same meaning and intent
4. Keep the SAME language as input (Turkish stays Turkish, English stays English, Persian stays Persian)
5. Do NOT add or remove information
6. Do NOT change the tone or style
7. Do NOT translate to another language
8. If the text is already correct, return it unchanged
9. Return ONLY the corrected text, nothing else`,
          },
          { role: 'user', content: text },
        ],
        'gpt-4o-mini',
      );

      const cleaned = response?.trim() || text;
      return {
        cleaned,
        original: text,
        wasFixed: cleaned !== text,
      };
    } catch (error) {
      this.logger.error('[cleanupSTTText] Error:', (error as Error).message);
      return { cleaned: text, original: text, wasFixed: false };
    }
  }

  /**
   * Quick chat response for voice interactions
   * Uses fast model for instant responses
   */
  async quickChatResponse(
    message: string,
    systemPrompt?: string,
  ): Promise<{ response: string }> {
    try {
      if (!message) {
        return { response: '' };
      }

      const { content: response } = await this.openai.chat(
        [
          {
            role: 'system',
            content:
              systemPrompt ||
              'Her zaman kullanıcının dilinde cevap ver. Kısa ve öz ol.',
          },
          { role: 'user', content: message },
        ],
        'gpt-4o-mini',
      );

      return { response: response || '' };
    } catch (error) {
      this.logger.error('[quickChatResponse] Error:', (error as Error).message);
      return { response: '' };
    }
  }
}
