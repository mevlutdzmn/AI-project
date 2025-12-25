/**
 * Chat Image Service
 * 
 * Handles all image-related operations in chat:
 * - Image generation detection
 * - Image edit detection
 * - DALL-E image generation
 * - Multi-turn image editing
 * 
 * @module chat/services/chat-image.service
 * @description Single Responsibility: Only handles image operations
 */

import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { messages, sessions } from '../../database/schema';
import { eq, desc } from 'drizzle-orm';
import { DalleAdapter } from '../../ai/adapters/dalle.adapter';
import { UsersService } from '../../users/users.service';
import {
  containsImageKeyword,
  containsImageEditKeyword,
  extractImageModification,
} from '../constants';

@Injectable()
export class ChatImageService {
  private readonly logger = new Logger(ChatImageService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private dalle: DalleAdapter,
    private usersService: UsersService,
  ) {}

  /**
   * Check if a message is requesting image generation
   * Excludes uploaded images (those go to GPT Vision)
   */
  isImageRequest(message: any): boolean {
    // If message contains an uploaded image, this is NOT an image generation request
    // It's an image ANALYSIS request - should go to GPT Vision, not DALL-E
    if (Array.isArray(message)) {
      const hasUploadedImage = message.some(
        (part: any) => part.type === 'image_url',
      );
      if (hasUploadedImage) {
        return false; // Send to GPT Vision for analysis, not DALL-E
      }

      const textParts = message
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ');
      return containsImageKeyword(textParts);
    }

    if (typeof message === 'string') {
      return containsImageKeyword(message);
    }

    return false;
  }

  /**
   * Check if this is a follow-up image editing request
   * Returns true if the message contains image editing keywords
   */
  isImageEditFollowUp(message: any): boolean {
    let messageText = '';

    if (typeof message === 'string') {
      messageText = message.toLowerCase();
    } else if (Array.isArray(message)) {
      messageText = message
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ')
        .toLowerCase();
    }

    return containsImageEditKeyword(messageText);
  }

  /**
   * Check if the last assistant message contains a generated image
   */
  async hasRecentImageInSession(sessionId: string): Promise<boolean> {
    try {
      const recentMessages = await this.db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      for (const msg of recentMessages) {
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          if (
            msg.content.includes('![Generated Image]') ||
            msg.content.includes('![AI Generated Image]') ||
            msg.content.includes('data:image/') ||
            (msg.content.includes('![') &&
              msg.content.includes('](data:image')) ||
            (msg.content.includes('](http') &&
              msg.content.includes('oaidalleapi'))
          ) {
            this.logger.log(
              `[ImageEditCheck] Found recent image in session ${sessionId}`,
            );
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      this.logger.error(
        '[ImageEditCheck] Error checking recent images:',
        error,
      );
      return false;
    }
  }

  /**
   * Find the previous image generation prompt from user messages
   */
  async findPreviousImagePrompt(sessionId: string): Promise<string | null> {
    try {
      const recentMessages = await this.db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(10);

      // Check if recent assistant message has image
      let foundImage = false;
      for (const msg of recentMessages) {
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          if (
            msg.content.includes('![AI Generated Image]') ||
            msg.content.includes('![Generated Image]')
          ) {
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) return null;

      // Find user message before the image
      for (let i = 0; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        if (
          msg.role === 'assistant' &&
          typeof msg.content === 'string' &&
          (msg.content.includes('![AI Generated Image]') ||
            msg.content.includes('![Generated Image]'))
        ) {
          for (let j = i + 1; j < recentMessages.length; j++) {
            if (recentMessages[j].role === 'user') {
              const userContent = recentMessages[j].content;
              if (typeof userContent === 'string') {
                this.logger.log(
                  `[ImageEdit] Found previous prompt: "${userContent.substring(0, 50)}..."`,
                );
                return userContent;
              }
              break;
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('[ImageEdit] Error finding previous prompt:', error);
      return null;
    }
  }

  /**
   * Handle image generation request
   */
  async handleImageRequest(
    sessionId: string,
    prompt: string,
    model?: string,
    isEditRequest: boolean = false,
  ): Promise<string> {
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

      // Check image limit for free users
      if (!isAdmin && !hasActivePremium && imageCredits >= 1) {
        const limitMsg =
          '🚫 **محدودیت ساخت تصویر شما تمام شد!**\n\n' +
          'حساب‌های رایگان فقط می‌توانند **۱ تصویر** بسازند.\n\n' +
          '✨ برای ساخت تصاویر نامحدود، به **پریمیوم ارتقا دهید**!';

        await this.saveAssistantMessage(sessionId, limitMsg, model);
        return limitMsg;
      }

      let finalPrompt = prompt.trim();

      // Multi-turn: If edit request, find previous prompt and combine
      if (isEditRequest && finalPrompt) {
        const previousPrompt = await this.findPreviousImagePrompt(sessionId);
        if (previousPrompt) {
          const modification = extractImageModification(finalPrompt);
          finalPrompt = `${previousPrompt}. Style modification: ${modification}. Keep the same subject and composition.`;
          this.logger.log(
            `[ImageEdit] Combined prompt: "${finalPrompt.substring(0, 150)}..."`,
          );
        }
      }

      if (!finalPrompt) {
        const errorMsg = '❌ لطفاً توضیحی برای تصویر مورد نظر خود بنویسید.';
        await this.saveAssistantMessage(sessionId, errorMsg, model);
        return errorMsg;
      }

      // Generate image with DALL-E
      const imageUrl = await this.dalle.generateImage(finalPrompt);
      const imageResponse = `![AI Generated Image](${imageUrl})`;

      // Increment image credits for non-admin users
      if (!isAdmin) {
        await this.usersService.incrementImageCredits(session.userId);
      }

      await this.saveAssistantMessage(sessionId, imageResponse, model);
      return imageResponse;
    } catch (error: unknown) {
      this.logger.error('Image generation failed:', error instanceof Error ? error.message : 'Unknown error');
      const errorMsg = this.getImageErrorMessage(error);
      await this.saveAssistantMessage(sessionId, errorMsg, model);
      return errorMsg;
    }
  }

  /**
   * Save assistant message to database
   */
  private async saveAssistantMessage(
    sessionId: string,
    content: string,
    model?: string,
  ): Promise<void> {
    await this.db.insert(messages).values({
      sessionId,
      role: 'assistant',
      content,
      model,
    });

    await this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Get user-friendly error message for image generation failures
   */
  private getImageErrorMessage(error: any): string {
    if (error.message.includes('safety system')) {
      return (
        '⚠️ درخواست شما توسط سیستم امنیتی رد شد.\n\n' +
        'لطفاً:\n• از کلمات مناسب و محترمانه استفاده کنید\n' +
        '• محتوای حساس، خشونت‌آمیز یا نامناسب درخواست نکنید\n' +
        '• توضیحات واضح‌تر برای تصویر مورد نظر بنویسید'
      );
    }

    if (error.message.includes('400')) {
      return '⚠️ درخواست نامعتبر. لطفاً توضیحات واضح‌تری برای تصویر بنویسید.';
    }

    if (error.message.includes('429') || error.message.includes('rate')) {
      return '⏳ تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.';
    }

    return '❌ تولید تصویر با خطا مواجه شد. لطفاً دوباره تلاش کنید.';
  }
}
