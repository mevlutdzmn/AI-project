/**
 * Gemini AI Adapter
 *
 * Google Gemini API integration following the same patterns as OpenAIAdapter.
 * Supports multiple Gemini models including:
 * - Chat: gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash-lite
 * - Image: gemini-2.5-flash-image, gemini-3-pro-image-preview
 * - Embedding: gemini-embedding-001
 * - TTS: gemini-2.5-flash-preview-tts
 *
 * @module ai/adapters/gemini
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { ChatMessage, FunctionCallResult, MessageContentPart } from './openai.adapter';

// ============================================
// Gemini System Prompt
// ============================================
const GEMINI_SYSTEM_PROMPT = `You are a helpful, friendly AI assistant powered by Google Gemini.
Your tone must be friendly, conversational, natural and helpful.

Rules:
- Use simple natural language.
- Add light emojis when appropriate 😊
- Be short and warm in greetings.
- Never mention you are an AI unless directly asked.
- Always try to be helpful and positive.
- Match the user's language - if they write in Persian/Farsi, respond in Persian/Farsi.
- If they write in Turkish, respond in Turkish.
- If they write in English, respond in English.
- Keep responses concise but complete.
- Use a conversational tone, like chatting with a friend.

IMPORTANT - Code Formatting:
- When writing code, ALWAYS use markdown code fences with the language specified.
- NEVER write code without code fences.
- For inline code, use single backticks.`;

// ============================================
// Gemini Model Constants
// ============================================
export const GEMINI_MODELS = {
  // Chat Models
  GEMINI_3_PRO: 'gemini-3-pro-preview',
  GEMINI_3_FLASH: 'gemini-3-flash-preview',
  GEMINI_2_5_PRO: 'gemini-2.5-pro',
  GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
  GEMINI_2_FLASH: 'gemini-2.0-flash',

  // Image Models (Native Image Generation)
  // ✅ CORRECT: gemini-2.0-flash-exp supports native image generation
  GEMINI_2_FLASH_EXP: 'gemini-2.0-flash-exp',
  GEMINI_2_5_FLASH_IMAGE: 'gemini-2.0-flash-exp',  // Alias for UI
  GEMINI_3_PRO_IMAGE: 'gemini-2.0-flash-exp',     // Alias for UI

  // Imagen (Separate API)
  IMAGEN_3: 'imagen-3.0-generate-002',
  IMAGEN_4: 'imagen-4.0-generate-001',

  // Video (Veo)
  VEO_3_1: 'veo-3.1-generate-preview',

  // TTS
  GEMINI_TTS: 'gemini-2.5-flash-preview-tts',

  // Embedding
  GEMINI_EMBEDDING: 'gemini-embedding-001',

  // Live Audio
  GEMINI_LIVE_AUDIO: 'gemini-2.5-flash-native-audio-preview-12-2025',
} as const;

// Default model for chat
const DEFAULT_MODEL = GEMINI_MODELS.GEMINI_2_FLASH;

// ============================================
// Gemini Content Types
// ============================================
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ✅ User-scoped context (same pattern as OpenAI)
interface UserContext {
  responseId: string | null;
  lastUsed: number;
}

@Injectable()
export class GeminiAdapter {
  private client: GoogleGenAI | null;
  private readonly contextStore = new Map<string, UserContext>();
  private readonly CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly logger = new Logger(GeminiAdapter.name);

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('GEMINI_API_KEY');
    if (!key) {
      this.logger.warn('⚠️ Gemini API key not found - will use mock responses');
      this.client = null;
    } else {
      this.client = new GoogleGenAI({ apiKey: key });
      this.logger.log('✅ Gemini adapter initialized');
    }

    // Cleanup expired contexts every 10 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredContexts(),
      10 * 60 * 1000,
    );
  }

  // ============================================
  // Context Management (same as OpenAI)
  // ============================================

  private getContext(sessionId: string): UserContext {
    let ctx = this.contextStore.get(sessionId);
    if (!ctx) {
      ctx = { responseId: null, lastUsed: Date.now() };
      this.contextStore.set(sessionId, ctx);
    }
    ctx.lastUsed = Date.now();
    return ctx;
  }

  private cleanupExpiredContexts(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, ctx] of this.contextStore.entries()) {
      if (now - ctx.lastUsed > this.CONTEXT_TTL) {
        this.contextStore.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`[Gemini] Cleaned up ${cleaned} expired contexts`);
    }
  }

  // ============================================
  // Message Format Conversion (OpenAI → Gemini)
  // ============================================

  /**
   * Convert OpenAI ChatMessage format to Gemini Content format
   */
  private convertMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): { contents: GeminiContent[]; systemInstruction?: string } {
    const contents: GeminiContent[] = [];
    let systemInstruction = systemPrompt || GEMINI_SYSTEM_PROMPT;

    for (const msg of messages) {
      // System messages become system instruction
      if (msg.role === 'system') {
        systemInstruction = typeof msg.content === 'string'
          ? msg.content
          : (msg.content as MessageContentPart[])
              .filter((p) => p.type === 'text' && p.text)
              .map((p) => p.text || '')
              .join('\n');
        continue;
      }

      // Convert role: assistant → model
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';

      // Convert content
      const parts: GeminiPart[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            // Convert image URL to inline data
            const url = part.image_url.url;
            if (url.startsWith('data:')) {
              // Base64 data URL
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                });
              }
            } else {
              // For regular URLs, we'll pass as text reference
              // Gemini requires inline data for images
              parts.push({
                text: `[Image: ${url}]`,
              });
            }
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { contents, systemInstruction };
  }

  // ============================================
  // Chat Method (Non-streaming)
  // ============================================

  async chat(
    messages: ChatMessage[],
    model: string = DEFAULT_MODEL,
    systemPrompt?: string,
    sessionId?: string,
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    if (!this.client) {
      return this.mockChatResponse(messages);
    }

    if (sessionId) {
      this.getContext(sessionId);
    }

    try {
      const { contents, systemInstruction } = this.convertMessages(messages, systemPrompt);

      const response = await this.client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });

      const text = response.text || '';

      // Extract usage if available
      const usage = response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined;

      return { content: text, usage };
    } catch (error: any) {
      this.logger.error(`[Gemini] Chat error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini): ${error.message}`);
    }
  }

  // ============================================
  // Stream Chat Method
  // ============================================

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model: string = DEFAULT_MODEL,
    sessionId?: string,
  ): Promise<void> {
    if (!this.client) {
      await this.mockStreamResponse(onChunk);
      return;
    }

    if (sessionId) {
      this.getContext(sessionId);
    }

    try {
      const { contents, systemInstruction } = this.convertMessages(messages);

      const response = await this.client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          onChunk(text);
        }
      }
    } catch (error: any) {
      this.logger.error(`[Gemini] Stream error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini): ${error.message}`);
    }
  }

  // ============================================
  // Function Calling (Compatible with OpenAI pattern)
  // ============================================

  async chatWithFunctionCalling(
    messages: ChatMessage[],
    model: string = DEFAULT_MODEL,
    hasRecentImage: boolean = false,
    sessionId?: string,
  ): Promise<FunctionCallResult> {
    if (!this.client) {
      return this.mockFunctionCallResponse(messages);
    }

    if (sessionId) {
      this.getContext(sessionId);
    }

    try {
      const { contents, systemInstruction } = this.convertMessages(messages);

      // Define tools for function calling
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'generate_image',
              description: 'Generate an AI image when user asks for any visual/image/picture/drawing.',
              parameters: {
                type: 'object',
                properties: {
                  prompt: {
                    type: 'string',
                    description: 'Detailed English description of the image to generate.',
                  },
                  format: {
                    type: 'string',
                    enum: ['jpg', 'png'],
                    description: 'Image format. Default is jpg.',
                  },
                  style: {
                    type: 'string',
                    enum: ['realistic', 'cartoon', 'anime', 'artistic', 'minimalist', 'photorealistic'],
                    description: 'The visual style of the image.',
                  },
                },
                required: ['prompt', 'format'],
              },
            },
            ...(hasRecentImage
              ? [
                  {
                    name: 'edit_image',
                    description: 'Edit or modify the previously generated image.',
                    parameters: {
                      type: 'object',
                      properties: {
                        modification: {
                          type: 'string',
                          description: 'English description of what to change in the image.',
                        },
                        format: {
                          type: 'string',
                          enum: ['jpg', 'png'],
                          description: 'New format if user wants to change it.',
                        },
                      },
                      required: ['modification'],
                    },
                  },
                ]
              : []),
          ],
        },
      ];

      // Use Object.assign to bypass TypeScript strict checking for tools
      const params = Object.assign({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }, { tools });

      this.logger.debug(`[Gemini] Function calling request with model: ${model}`);
      const response = await this.client.models.generateContent(params as any);

      // Check for function calls
      const candidate = response.candidates?.[0];
      this.logger.debug(`[Gemini] Response candidate parts: ${JSON.stringify(candidate?.content?.parts?.map((p: any) => Object.keys(p)))}`);
      
      const functionCall = candidate?.content?.parts?.find(
        (p: any) => p.functionCall,
      )?.functionCall;

      if (functionCall) {
        this.logger.log(`[Gemini] Function call detected: ${functionCall.name}`);
        return {
          type: 'function_call',
          functionName: functionCall.name,
          functionArgs: functionCall.args as Record<string, any>,
          usage: response.usageMetadata
            ? {
                promptTokens: response.usageMetadata.promptTokenCount || 0,
                completionTokens: response.usageMetadata.candidatesTokenCount || 0,
              }
            : undefined,
        };
      }

      // Text response - no function call
      this.logger.debug(`[Gemini] No function call, returning text response`);
      return {
        type: 'text',
        content: response.text || '',
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
      };
    } catch (error: any) {
      this.logger.error(`[Gemini] Function calling error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini): ${error.message}`);
    }
  }

  // ============================================
  // Embedding (for RAG)
  // ============================================

  async embedContent(
    text: string,
    model: string = GEMINI_MODELS.GEMINI_EMBEDDING,
  ): Promise<number[]> {
    if (!this.client) {
      // Return mock embedding (768 dimensions)
      return Array(768).fill(0).map(() => Math.random() * 2 - 1);
    }

    try {
      const response = await this.client.models.embedContent({
        model,
        contents: text,
      });

      return response.embeddings?.[0]?.values || [];
    } catch (error: any) {
      this.logger.error(`[Gemini] Embedding error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini Embedding): ${error.message}`);
    }
  }

  // ============================================
  // Native Image Generation (Nano Banana)
  // ============================================

  async generateImage(
    prompt: string,
    model: string = GEMINI_MODELS.GEMINI_2_5_FLASH_IMAGE,
  ): Promise<{ imageData: string; mimeType: string; revisedPrompt?: string }> {
    if (!this.client) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['image', 'text'],
        },
      });

      // Find image part in response
      const imagePart = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inlineData?.mimeType?.startsWith('image/'),
      );

      if (imagePart?.inlineData) {
        return {
          imageData: imagePart.inlineData.data || '',
          mimeType: imagePart.inlineData.mimeType || 'image/png',
          revisedPrompt: response.text,
        };
      }

      throw new Error('No image generated');
    } catch (error: any) {
      this.logger.error(`[Gemini] Image generation error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini Image): ${error.message}`);
    }
  }

  // ============================================
  // Native Image Generation (gemini-2.0-flash-exp)
  // ✅ CORRECT API: Uses responseModalities: ['Image', 'Text']
  // ============================================

  async generateNanoBananaImage(
    prompt: string,
    _model: string = GEMINI_MODELS.GEMINI_2_FLASH_EXP,
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
  ): Promise<{ imageData: string; mimeType: string; revisedPrompt?: string }> {
    if (!this.client) {
      throw new Error('Gemini API key not configured');
    }

    // ✅ Always use gemini-2.0-flash-exp for image generation
    const imageModel = 'gemini-2.0-flash-exp';
    this.logger.log(`[Gemini] Generating native image with model: ${imageModel}`);

    try {
      // ✅ Detect transparent/PNG/no background requests
      const lowerPrompt = prompt.toLowerCase();
      const wantsTransparent = lowerPrompt.includes('transparent') || 
        lowerPrompt.includes('png') ||
        lowerPrompt.includes('arka plan') ||
        lowerPrompt.includes('arkaplan') ||
        lowerPrompt.includes('background') ||
        lowerPrompt.includes('cutout') ||
        lowerPrompt.includes('olmasın') ||
        lowerPrompt.includes('kaldır') ||
        lowerPrompt.includes('olmadan');
      
      // Enhance prompt for better image quality
      let enhancedPrompt: string;
      if (wantsTransparent) {
        enhancedPrompt = `Create a PNG image with TRANSPARENT background, NO background at all, just the subject isolated on a transparent/alpha channel background: ${prompt}. The subject should be clearly cut out with no background elements.`;
      } else {
        enhancedPrompt = `Create a high-quality, detailed image: ${prompt}. Make it visually stunning and professional.`;
      }

      const response = await this.client.models.generateContent({
        model: imageModel,
        contents: enhancedPrompt,
        config: {
          // ✅ CORRECT: Capital letters for modalities
          responseModalities: ['Image', 'Text'],
        },
      });

      // Extract image from response
      const candidate = response.candidates?.[0];
      this.logger.debug(`[Gemini] Response parts: ${JSON.stringify(candidate?.content?.parts?.map((p: any) => Object.keys(p)))}`);
      
      const imagePart = candidate?.content?.parts?.find(
        (p: any) => p.inlineData?.mimeType?.startsWith('image/'),
      );

      if (imagePart?.inlineData) {
        this.logger.log(`[Gemini] ✅ Native image generated successfully`);
        return {
          imageData: imagePart.inlineData.data || '',
          mimeType: imagePart.inlineData.mimeType || 'image/png',
          revisedPrompt: response.text || prompt,
        };
      }

      // If no image, check text response for error
      const textResponse = response.text;
      if (textResponse) {
        this.logger.warn(`[Gemini] Model returned text instead of image: ${textResponse.slice(0, 200)}`);
        throw new Error(`Model returned text: ${textResponse.slice(0, 100)}`);
      }

      throw new Error('Gemini did not generate an image. Try a different prompt.');
    } catch (error: any) {
      this.logger.error(`[Gemini] Native image generation error: ${error.message}`);
      throw new Error(`AI Provider Error (Gemini Image): ${error.message}`);
    }
  }

  // ============================================
  // Imagen Image Generation (imagen-3.0-generate-002)
  // ============================================

  async generateImagenImage(
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1',
    numberOfImages: number = 1,
  ): Promise<{ imageData: string; mimeType: string; revisedPrompt?: string }[]> {
    if (!this.client) {
      throw new Error('Gemini API key not configured');
    }

    this.logger.log(`[Gemini] Generating Imagen image, aspectRatio: ${aspectRatio}`);

    try {
      // Imagen uses generateImages API
      const response = await this.client.models.generateImages({
        model: GEMINI_MODELS.IMAGEN_3,
        prompt,
        config: {
          numberOfImages,
          aspectRatio,
        },
      });

      const images = response.generatedImages || [];
      
      if (images.length === 0) {
        throw new Error('Imagen did not generate any images');
      }

      this.logger.log(`[Gemini] ✅ Imagen generated ${images.length} image(s)`);

      return images.map((img: any) => ({
        imageData: img.image?.imageBytes || '',
        mimeType: 'image/png',
        revisedPrompt: prompt,
      }));
    } catch (error: any) {
      this.logger.error(`[Gemini] Imagen error: ${error.message}`);
      throw new Error(`AI Provider Error (Imagen): ${error.message}`);
    }
  }

  // ============================================
  // Check if model is Gemini Image capable
  // ============================================

  isGeminiImageModel(model: string): boolean {
    return (
      model === GEMINI_MODELS.GEMINI_2_5_FLASH_IMAGE ||
      model === GEMINI_MODELS.GEMINI_3_PRO_IMAGE ||
      model === GEMINI_MODELS.GEMINI_2_FLASH_EXP ||
      model.startsWith('imagen')
    );
  }

  // ============================================
  // Mock Responses (when API key not available)
  // ============================================

  private async mockChatResponse(
    messages: ChatMessage[],
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : 'Hello!';

    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      content: `[Gemini Mock Response] I received: "${content.slice(0, 50)}..."`,
      usage: { promptTokens: 100, completionTokens: 50 },
    };
  }

  private async mockStreamResponse(onChunk: (chunk: string) => void): Promise<void> {
    const response = '[Gemini Mock Response] This is a streaming test response.';
    const words = response.split(' ');

    for (const word of words) {
      onChunk(word + ' ');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private mockFunctionCallResponse(messages: ChatMessage[]): FunctionCallResult {
    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : 'Hello!';

    return {
      type: 'text',
      content: `[Gemini Mock] I received: "${content.slice(0, 50)}..."`,
      usage: { promptTokens: 100, completionTokens: 50 },
    };
  }

  // ============================================
  // Utility Methods
  // ============================================

  isAvailable(): boolean {
    return this.client !== null;
  }

  getSupportedModels(): string[] {
    return Object.values(GEMINI_MODELS);
  }

  isGeminiModel(model: string): boolean {
    return (
      model.startsWith('gemini') ||
      model.startsWith('imagen') ||
      model.startsWith('veo') ||
      model.startsWith('models/lyria')
    );
  }
}
