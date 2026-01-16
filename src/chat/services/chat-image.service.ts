/**
 * Chat Image Service
 * 
 * Handles all image-related operations in chat:
 * - Image generation detection
 * - Image edit detection
 * - GPT-5.2 Responses API image generation (ChatGPT-style)
 * - Multi-turn image editing via previous_response_id
 * 
 * @module chat/services/chat-image.service
 * @description ChatGPT-style multi-turn image editing
 */

import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { messages, sessions } from '../../database/schema';
import { eq, desc } from 'drizzle-orm';
import { OpenAIAdapter } from '../../ai/adapters/openai.adapter';
import { GeminiAdapter } from '../../ai/adapters/gemini.adapter';
import { UsersService } from '../../users/users.service';
import { StorageService } from '../../storage/storage.service';
import {
  containsImageKeyword,
  containsImageEditKeyword,
} from '../constants';

// Image context stored in messages.image_context
interface ImageContext {
  responseId: string;
  imageCallId: string;
  revisedPrompt?: string;
  // ✅ Gemini-specific fields
  imageUrl?: string;
  model?: string;
  provider?: 'openai' | 'gemini';
}

@Injectable()
export class ChatImageService {
  private readonly logger = new Logger(ChatImageService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private openai: OpenAIAdapter,
    private gemini: GeminiAdapter,
    private usersService: UsersService,
    private storageService: StorageService, // ✅ Supabase Storage for Vercel
  ) {}

  // ============================================
  // ✅ NEW: Function Calling Handler
  // ============================================

  /**
   * ✅ Handle image data from Function Calling result (GPT-5.2)
   * When AI decides to generate an image, the base64 data comes here
   * 
   * @param sessionId - Session ID
   * @param functionArgs - { imageBase64, responseId, imageCallId, revisedPrompt, format }
   * @param model - Model used
   * @returns Image response string with markdown
   */
  async handleFunctionCallResult(
    sessionId: string,
    functionArgs: {
      imageBase64: string;
      responseId: string;
      imageCallId: string;
      revisedPrompt?: string;
      format?: 'jpg' | 'png';
    },
    model?: string,
  ): Promise<string> {
    try {
      // Determine format - default to jpg
      const imageFormat = functionArgs.format || 'jpg';
      this.logger.log(`[FunctionCallResult] Processing image from AI decision, format: ${imageFormat}`);

      // Validate user limits
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

      const isAdmin = user.isAdmin;
      const isPremium = user.isPremium || false;
      const subscriptionEnd = user.subscriptionExpiresAt
        ? new Date(user.subscriptionExpiresAt)
        : null;
      const imageCredits = user.imageCredits || 0;
      const now = new Date();
      const hasActivePremium = isPremium && (!subscriptionEnd || subscriptionEnd > now);

      // Check image limit for free users
      if (!isAdmin && !hasActivePremium && imageCredits >= 1) {
        const limitMsg =
          '🚫 **Görsel oluşturma limitiniz doldu!**\n\n' +
          'Ücretsiz hesaplar yalnızca **1 görsel** oluşturabilir.\n\n' +
          '✨ Sınırsız görsel için **Premium**\'a yükseltin!';

        await this.saveAssistantMessage(sessionId, limitMsg, model);
        return limitMsg;
      }

      // Save image - use Supabase Storage for Vercel, fallback to local
      const imageFileName = `img_${randomUUID()}.${imageFormat}`;
      const contentType = imageFormat === 'png' ? 'image/png' : 'image/jpeg';
      let imageUrl: string;

      if (this.storageService.isAvailable()) {
        // ✅ Vercel: Use Supabase Storage
        this.logger.log('[FunctionCallResult] Using Supabase Storage...');
        imageUrl = await this.storageService.uploadImage(
          functionArgs.imageBase64,
          imageFileName,
          contentType,
        );
        this.logger.log(`[FunctionCallResult] ✅ Uploaded to Supabase: ${imageUrl}`);
      } else {
        // Fallback: Local filesystem (development only)
        this.logger.log('[FunctionCallResult] Using local filesystem...');
        const uploadsDir = process.env.UPLOAD_DIR || './uploads';
        const imagePath = path.join(uploadsDir, imageFileName);
        
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const imageBuffer = Buffer.from(functionArgs.imageBase64, 'base64');
        fs.writeFileSync(imagePath, imageBuffer);
        
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        imageUrl = `${backendUrl}/uploads/${imageFileName}`;
        this.logger.log(`[FunctionCallResult] ✅ Saved locally: ${imagePath}`);
      }

      const imageResponse = `![Generated Image](${imageUrl})`;
      
      this.logger.log(`[FunctionCallResult] ✅ Image saved as ${imageFormat.toUpperCase()}: ${imageUrl}`);

      // Increment image credits for non-admin users
      if (!isAdmin) {
        await this.usersService.incrementImageCredits(session.userId);
      }

      // Save with imageContext for multi-turn edits
      await this.saveAssistantMessage(sessionId, imageResponse, model, {
        responseId: functionArgs.responseId,
        imageCallId: functionArgs.imageCallId,
        revisedPrompt: functionArgs.revisedPrompt || '',
      });

      return imageResponse;
    } catch (error: any) {
      this.logger.error('[FunctionCallResult] Error:', error);
      const errorMsg = this.getImageErrorMessage(error);
      await this.saveAssistantMessage(sessionId, errorMsg, model);
      return errorMsg;
    }
  }

  // ============================================
  // ⚠️ DEPRECATED: Keyword-based detection
  // These methods are kept for backwards compatibility
  // Use Function Calling (chatWithFunctionCalling) instead!
  // ============================================

  /**
   * @deprecated Use Function Calling instead - AI decides automatically!
   * Check if a message is requesting image generation
   * Excludes uploaded images (those go to GPT Vision)
   */
  isImageRequest(message: any): boolean {
    this.logger.warn('[DEPRECATED] isImageRequest called - use Function Calling instead');
    
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
   * @deprecated Use Function Calling instead - AI decides automatically!
   * Check if this is a follow-up image editing request
   * Returns true if the message contains image editing keywords OR
   * if it looks like a short modification command
   */
  isImageEditFollowUp(message: any): boolean {
    let messageText = '';

    if (typeof message === 'string') {
      messageText = message.toLowerCase().trim();
    } else if (Array.isArray(message)) {
      messageText = message
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ')
        .toLowerCase()
        .trim();
    }

    // Check explicit edit keywords first
    if (containsImageEditKeyword(messageText)) {
      return true;
    }
    
    // ✅ Smart detection: Short messages ending with common Turkish edit patterns
    const wordCount = messageText.split(/\s+/).length;
    if (wordCount <= 10) {
      // Turkish edit patterns
      const turkishEditPatterns = [
        /olsun$/i,           // "...olsun" (let it be)
        /yap$/i,             // "...yap" (make it)
        /koy$/i,             // "...koy" (put it)
        /ekle$/i,            // "...ekle" (add)
        /çıkar$/i,           // "...çıkar" (remove)
        /değiştir$/i,        // "...değiştir" (change)
        /üstünde/i,          // "...üstünde" (on top of)
        /üzerinde/i,         // "...üzerinde" (on)
        /altında/i,          // "...altında" (under)
        /yanında/i,          // "...yanında" (next to)
        /içinde/i,           // "...içinde" (inside)
        /arkasında/i,        // "...arkasında" (behind)
        /önünde/i,           // "...önünde" (in front of)
        /elinde/i,           // "...elinde" (in hand)
        /elinin/i,           // "...elinin" (of hand)
      ];
      
      for (const pattern of turkishEditPatterns) {
        if (pattern.test(messageText)) {
          this.logger.log(`[ImageEdit] Detected edit pattern: "${messageText}"`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if the last assistant message contains a generated image
   */
  async hasRecentImageInSession(sessionId: string): Promise<boolean> {
    const ctx = await this.findPreviousImageContext(sessionId);
    return ctx !== null;
  }

  /**
   * ✅ NEW: Find previous image context (responseId, imageCallId) from recent messages
   * This replaces findPreviousImagePrompt() - ChatGPT uses IDs, not prompts!
   */
  async findPreviousImageContext(sessionId: string): Promise<ImageContext | null> {
    try {
      const recentMessages = await this.db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(10);

      for (const msg of recentMessages) {
        if (msg.role === 'assistant' && msg.imageContext) {
          const ctx = msg.imageContext as ImageContext;
          
          // ✅ OpenAI format: responseId + imageCallId
          if (ctx.responseId && ctx.imageCallId) {
            this.logger.log(
              `[ImageContext] Found OpenAI context: responseId=${ctx.responseId}, callId=${ctx.imageCallId}`,
            );
            return ctx;
          }
          
          // ✅ Gemini format: imageUrl + revisedPrompt (no responseId needed)
          if (ctx.imageUrl || ctx.revisedPrompt) {
            this.logger.log(
              `[ImageContext] Found Gemini context: prompt="${ctx.revisedPrompt?.substring(0, 50)}..."`,
            );
            return ctx;
          }
        }
        
        // ✅ Also check if content has an image (fallback detection)
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          if (msg.content.includes('![Generated Image]') || msg.content.includes('![Gemini Image]')) {
            this.logger.log(`[ImageContext] Found image in message content (fallback)`);
            // Extract image URL from markdown
            const urlMatch = msg.content.match(/!\[.*?\]\((.*?)\)/);
            return {
              responseId: '',
              imageCallId: '',
              imageUrl: urlMatch?.[1] || '',
              revisedPrompt: 'previous image',
            };
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('[ImageContext] Error finding previous context:', error);
      return null;
    }
  }

  /**
   * Handle image generation request - ChatGPT style
   * Uses GPT-5.2 Responses API with previous_response_id for multi-turn
   */
  async handleImageRequest(
    sessionId: string,
    prompt: string,
    model?: string,
    isEditRequest: boolean = false,
    previousContext?: ImageContext | null,
    format: 'jpg' | 'png' = 'jpg', // Default to JPG unless PNG explicitly requested
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
          '🚫 **Görsel oluşturma limitiniz doldu!**\n\n' +
          'Ücretsiz hesaplar yalnızca **1 görsel** oluşturabilir.\n\n' +
          '✨ Sınırsız görsel için **Premium**\'a yükseltin!';

        await this.saveAssistantMessage(sessionId, limitMsg, model);
        return limitMsg;
      }

      const finalPrompt = prompt.trim();
      if (!finalPrompt) {
        const errorMsg = '❌ Lütfen oluşturmak istediğiniz görseli açıklayın.';
        await this.saveAssistantMessage(sessionId, errorMsg, model);
        return errorMsg;
      }

      let result: {
        imageBase64: string;
        responseId: string;
        imageCallId: string;
        revisedPrompt: string;
      };

      // ✅ ChatGPT-style: Use previous_response_id if available
      const contextToUse = previousContext || (isEditRequest ? await this.findPreviousImageContext(sessionId) : null);
      
      if (contextToUse?.responseId) {
        // Multi-turn: Edit existing image
        this.logger.log(`[Image] Using previous_response_id: ${contextToUse.responseId}`);
        result = await this.openai.editImage(
          finalPrompt,
          contextToUse.responseId,
          sessionId,
          model || 'gpt-5.2',
        );
      } else {
        // New image generation
        this.logger.log('[Image] Generating new image (no previous context)');
        result = await this.openai.generateImage(finalPrompt, sessionId, model || 'gpt-5.2');
      }

      // ✅ Save image - use Supabase Storage for Vercel, fallback to local
      const imageFileName = `img_${randomUUID()}.${format}`;
      const contentType = format === 'png' ? 'image/png' : 'image/jpeg';
      let imageUrl: string;

      if (this.storageService.isAvailable()) {
        // ✅ Vercel: Use Supabase Storage
        this.logger.log('[Image] Using Supabase Storage...');
        imageUrl = await this.storageService.uploadImage(
          result.imageBase64,
          imageFileName,
          contentType,
        );
        this.logger.log(`[Image] ✅ Uploaded to Supabase: ${imageUrl}`);
      } else {
        // Fallback: Local filesystem (development only)
        this.logger.log('[Image] Using local filesystem...');
        const uploadsDir = process.env.UPLOAD_DIR || './uploads';
        const imagePath = path.join(uploadsDir, imageFileName);
        
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const imageBuffer = Buffer.from(result.imageBase64, 'base64');
        fs.writeFileSync(imagePath, imageBuffer);
        
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        imageUrl = `${backendUrl}/uploads/${imageFileName}`;
        this.logger.log(`[Image] ✅ Saved locally: ${imagePath}`);
      }

      const imageResponse = `![Generated Image](${imageUrl})`;
      
      this.logger.log(`[Image] ✅ Generation successful - responseId: ${result.responseId}`);

      // Increment image credits for non-admin users
      if (!isAdmin) {
        this.logger.log(`[Image] Incrementing credits for user: ${session.userId}`);
        await this.usersService.incrementImageCredits(session.userId);
        this.logger.log(`[Image] ✅ Credits incremented`);
      }

      // ✅ Save with imageContext for future multi-turn edits
      this.logger.log(`[Image] Saving assistant message with imageContext...`);
      await this.saveAssistantMessage(sessionId, imageResponse, model, {
        responseId: result.responseId,
        imageCallId: result.imageCallId,
        revisedPrompt: result.revisedPrompt,
      });
      this.logger.log(`[Image] ✅ Message saved, returning response`);

      return imageResponse;
    } catch (error: unknown) {
      this.logger.error('[Image] ❌ CATCH BLOCK HIT!');
      this.logger.error('[Image] Error type:', typeof error);
      this.logger.error('[Image] Error name:', error instanceof Error ? error.name : 'Unknown');
      this.logger.error('[Image] Error message:', error instanceof Error ? error.message : 'Unknown');
      if (error instanceof Error && error.stack) {
        this.logger.error('[Image] Stack trace:', error.stack);
      }
      // Log additional OpenAI error properties
      const err = error as any;
      if (err?.status || err?.code || err?.type) {
        this.logger.error('[Image] OpenAI Error details:', JSON.stringify({
          status: err.status,
          code: err.code,
          type: err.type,
        }, null, 2));
      }
      const errorMsg = this.getImageErrorMessage(error);
      await this.saveAssistantMessage(sessionId, errorMsg, model);
      return errorMsg;
    }
  }

  /**
   * ✅ ChatGPT-style: Let GPT decide what to do
   * Send the user's message with previous_response_id and let GPT choose:
   * - Generate/edit an image
   * - Respond with text
   */
  async handleSmartImageRequest(
    sessionId: string,
    userMessage: string,
    model?: string,
    previousContext?: ImageContext | null,
  ): Promise<{ isImageResponse: boolean; content: string }> {
    try {
      this.logger.log(`[SmartImage] User: "${userMessage}", hasContext: ${!!previousContext}`);
      
      if (!previousContext?.responseId) {
        // No previous image context, this shouldn't happen but handle gracefully
        return { isImageResponse: false, content: '' };
      }

      // ✅ ChatGPT-style: Send to GPT with previous_response_id
      // GPT will decide based on context whether to generate image or respond with text
      const result = await this.openai.smartImageRequest(
        userMessage,
        previousContext.responseId,
        sessionId,
        model || 'gpt-5.2',
      );

      // Check if GPT decided to generate an image
      if (result.hasImage && result.imageBase64) {
        // ✅ Save image - use Supabase Storage for Vercel, fallback to local
        const imageFileName = `img_${randomUUID()}.png`;
        let imageUrl: string;

        if (this.storageService.isAvailable()) {
          // ✅ Vercel: Use Supabase Storage
          this.logger.log('[SmartImage] Using Supabase Storage...');
          imageUrl = await this.storageService.uploadImage(
            result.imageBase64,
            imageFileName,
            'image/png',
          );
          this.logger.log(`[SmartImage] ✅ Uploaded to Supabase: ${imageUrl}`);
        } else {
          // Fallback: Local filesystem (development only)
          this.logger.log('[SmartImage] Using local filesystem...');
          const uploadsDir = process.env.UPLOAD_DIR || './uploads';
          const imagePath = path.join(uploadsDir, imageFileName);
          
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          const imageBuffer = Buffer.from(result.imageBase64, 'base64');
          fs.writeFileSync(imagePath, imageBuffer);
          
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
          imageUrl = `${backendUrl}/uploads/${imageFileName}`;
          this.logger.log(`[SmartImage] ✅ Saved locally: ${imagePath}`);
        }

        const imageResponse = `![Generated Image](${imageUrl})`;
        
        this.logger.log(`[SmartImage] ✅ GPT generated image`);
        
        // Save with new context
        await this.saveAssistantMessage(sessionId, imageResponse, model, {
          responseId: result.responseId,
          imageCallId: result.imageCallId || '',
          revisedPrompt: result.revisedPrompt || userMessage,
        });
        
        return { isImageResponse: true, content: imageResponse };
      }

      // GPT responded with text, not an image
      this.logger.log(`[SmartImage] GPT chose text response (not image)`);
      return { isImageResponse: false, content: result.textResponse || '' };
      
    } catch (error) {
      this.logger.error('[SmartImage] Error:', error);
      // On error, fall back to normal chat flow
      return { isImageResponse: false, content: '' };
    }
  }

  // ============================================
  // ✅ NEW: Handle Gemini Native Image Generation
  // Supports: gemini-2.5-flash-image, gemini-3-pro-image-preview, imagen-4
  // ============================================

  async handleGeminiImageRequest(
    sessionId: string,
    prompt: string,
    model: string,
  ): Promise<{ content: string; assistantMessageId: number }> {
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
          '🚫 **Görsel oluşturma limitiniz doldu!**\n\n' +
          'Ücretsiz hesaplar yalnızca **1 görsel** oluşturabilir.\n\n' +
          '✨ Sınırsız görsel için **Premium**\'a yükseltin!';

        const assistantMessageId = await this.saveAssistantMessage(sessionId, limitMsg, model);
        return { content: limitMsg, assistantMessageId };
      }

      const finalPrompt = prompt.trim();
      if (!finalPrompt) {
        const errorMsg = '❌ Lütfen oluşturmak istediğiniz görseli açıklayın.';
        const assistantMessageId = await this.saveAssistantMessage(sessionId, errorMsg, model);
        return { content: errorMsg, assistantMessageId };
      }

      this.logger.log(`[GeminiImage] Generating with model: ${model}`);

      let result: { imageData: string; mimeType: string; revisedPrompt?: string };

      // Route to appropriate Gemini image API
      if (model.startsWith('imagen')) {
        // Imagen 4 API
        const images = await this.gemini.generateImagenImage(finalPrompt, '1:1', 1);
        if (images.length === 0) {
          throw new Error('Imagen did not generate any images');
        }
        result = images[0];
      } else {
        // Nano Banana (gemini-2.5-flash-image, gemini-3-pro-image-preview)
        result = await this.gemini.generateNanoBananaImage(finalPrompt, model);
      }

      // Determine file extension from mime type
      const mimeType = result.mimeType || 'image/png';
      const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
      const imageFileName = `gemini_${randomUUID()}.${extension}`;
      const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
      
      let imageUrl: string;

      if (this.storageService.isAvailable()) {
        // ✅ Vercel: Use Supabase Storage
        this.logger.log('[GeminiImage] Using Supabase Storage...');
        imageUrl = await this.storageService.uploadImage(
          result.imageData,
          imageFileName,
          contentType,
        );
        this.logger.log(`[GeminiImage] ✅ Uploaded to Supabase: ${imageUrl}`);
      } else {
        // Fallback: Local filesystem (development only)
        this.logger.log('[GeminiImage] Using local filesystem...');
        const uploadsDir = process.env.UPLOAD_DIR || './uploads';
        const imagePath = path.join(uploadsDir, imageFileName);
        
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const imageBuffer = Buffer.from(result.imageData, 'base64');
        fs.writeFileSync(imagePath, imageBuffer);
        
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        imageUrl = `${backendUrl}/uploads/${imageFileName}`;
        this.logger.log(`[GeminiImage] ✅ Saved locally: ${imagePath}`);
      }

      const imageResponse = `![Generated Image](${imageUrl})`;
      
      this.logger.log(`[GeminiImage] ✅ Gemini image generated successfully with ${model}`);

      // Increment image credits for non-admin users
      if (!isAdmin) {
        await this.usersService.incrementImageCredits(session.userId);
      }

      // ✅ Save message WITH imageContext for edit follow-ups
      const assistantMessageId = await this.saveAssistantMessage(sessionId, imageResponse, model, {
        responseId: '',  // Gemini doesn't use responseId
        imageCallId: '', // Gemini doesn't use imageCallId
        imageUrl: imageUrl,
        revisedPrompt: result.revisedPrompt || finalPrompt,
        model: model,
        provider: 'gemini',
      });

      return { content: imageResponse, assistantMessageId };
    } catch (error: any) {
      this.logger.error('[GeminiImage] Error:', error);
      const errorMsg = this.getGeminiImageErrorMessage(error);
      const assistantMessageId = await this.saveAssistantMessage(sessionId, errorMsg, model);
      return { content: errorMsg, assistantMessageId };
    }
  }

  /**
   * Get user-friendly error message for Gemini image generation failures
   */
  private getGeminiImageErrorMessage(error: any): string {
    const msg = error?.message || '';
    
    if (msg.includes('safety') || msg.includes('blocked')) {
      return (
        '⚠️ **Güvenlik Uyarısı**\n\n' +
        'İsteğiniz Gemini güvenlik filtreleri tarafından reddedildi.\n\n' +
        'Lütfen uygun ve saygılı ifadeler kullanın.'
      );
    }

    if (msg.includes('not support') || msg.includes('Nano Banana')) {
      return (
        '❌ **Model Uyumsuzluğu**\n\n' +
        'Bu Gemini modeli görsel oluşturmayı desteklemiyor.\n\n' +
        '💡 Görsel için **Gemini Image** veya **GPT-5.2** modelini seçin.'
      );
    }

    if (msg.includes('quota') || msg.includes('429')) {
      return '⏳ Gemini API limiti aşıldı. Lütfen birkaç dakika bekleyin.';
    }

    if (msg.includes('API key')) {
      return '❌ Gemini API yapılandırma hatası. Lütfen yöneticiyle iletişime geçin.';
    }

    return '❌ Gemini görsel oluşturma başarısız oldu. Lütfen tekrar deneyin veya farklı bir model seçin.';
  }

  /**
   * Save assistant message with optional image context
   * Returns the message ID for streaming completion
   */
  private async saveAssistantMessage(
    sessionId: string,
    content: string,
    model?: string,
    imageContext?: ImageContext,
  ): Promise<number> {
    const [insertedMsg] = await this.db.insert(messages).values({
      sessionId,
      role: 'assistant',
      content,
      model,
      imageContext: imageContext || null, // ✅ Store for multi-turn
    }).returning({ id: messages.id });

    await this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
    
    return insertedMsg.id;
  }

  /**
   * Get user-friendly error message for image generation failures
   */
  private getImageErrorMessage(error: any): string {
    const msg = error?.message || '';
    const code = error?.code || error?.status || '';
    
    // Log the error for debugging
    this.logger.warn(`[ImageError] Processing error - message: "${msg}", code: "${code}"`);
    
    if (msg.includes('safety') || msg.includes('content_policy')) {
      return (
        '⚠️ **Güvenlik Uyarısı**\n\n' +
        'İsteğiniz güvenlik filtreleri tarafından reddedildi.\n\n' +
        'Lütfen:\n• Uygun ve saygılı ifadeler kullanın\n' +
        '• Hassas, şiddet içeren veya uygunsuz içerik talep etmeyin'
      );
    }

    if (msg.includes('rate') || msg.includes('429') || code === 429) {
      return '⏳ Çok fazla istek gönderildi. Lütfen birkaç dakika bekleyin.';
    }

    if (msg.includes('quota') || msg.includes('insufficient_quota') || msg.includes('billing')) {
      return '❌ API kotası aşıldı. Lütfen yöneticiyle iletişime geçin.';
    }

    if (msg.includes('invalid_api_key') || msg.includes('Incorrect API key') || code === 401) {
      return '❌ API yapılandırma hatası. Lütfen yöneticiyle iletişime geçin.';
    }

    if (msg.includes('model') || msg.includes('does not exist')) {
      return '❌ Model bulunamadı. Lütfen farklı bir model deneyin.';
    }

    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      return '❌ Bağlantı zaman aşımı. Lütfen tekrar deneyin.';
    }

    if (msg.includes('OpenAI client not initialized')) {
      return '❌ AI servisi başlatılamadı. Lütfen yöneticiyle iletişime geçin.';
    }

    return '❌ Görsel oluşturma başarısız oldu. Lütfen tekrar deneyin.';
  }
}
