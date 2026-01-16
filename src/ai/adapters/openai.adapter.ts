import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCHEMAS, type SchemaName } from '../schemas/structured';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ChatGPT tarzı system prompt - doğal ve samimi konuşma
const CHATGPT_SYSTEM_PROMPT = `You are ChatGPT, a highly capable large language model built by OpenAI.
Your tone must be friendly, conversational, natural and helpful.

Rules:
- Answer like ChatGPT website.
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
- Example: \`\`\`python
print("Hello")
\`\`\`
- Example: \`\`\`javascript
console.log("Hello");
\`\`\`
- Example: \`\`\`html
<div>Hello</div>
\`\`\`
- NEVER write code without code fences.
- For inline code, use single backticks: \`code\`
- This is critical for proper syntax highlighting.`;

// ============================================
// Function Calling / Tools Definitions
// ============================================
// ChatGPT-style: AI decides when to use these tools
// No keyword detection needed - AI understands intent

/**
 * Tool definitions for OpenAI Function Calling (GPT-4o)
 * AI will automatically call these when user requests image generation
 * Works for ALL languages - no keyword lists needed!
 */
const FUNCTION_CALLING_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: `Generate an AI image when user asks for any visual/image/picture/drawing.

Use this tool when user wants an image created:
- Turkish: "kedi çiz", "resim yap", "görsel oluştur", "bir X çiz"
- English: "draw a cat", "create an image", "generate a picture"
- Persian: "یه گربه بکش", "تصویر بساز"

IMPORTANT - Format detection:
- If user mentions "png", "PNG", "şeffaf", "transparent" → set format to "png"
- Otherwise → set format to "jpg" (default)

Examples:
- "kedi çiz" → format: "jpg"
- "kedi png çiz" → format: "png"
- "şeffaf arkaplan ile logo yap" → format: "png"
- "draw a cat with transparent background" → format: "png"`,
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
            description: 'Image format. Use "png" ONLY if user explicitly mentions png/PNG/şeffaf/transparent. Default is "jpg".',
          },
          style: {
            type: 'string',
            enum: ['realistic', 'cartoon', 'anime', 'artistic', 'minimalist', 'photorealistic'],
            description: 'The visual style of the image. Default is realistic.',
          },
        },
        required: ['prompt', 'format'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_image',
      description: `Edit or modify the previously generated image using AI. 

Use this tool when there's a recent image AND user wants ANY changes:
- Format changes: "png yap", "jpg yap", "transparent yap"
- Size changes: "daha büyük olsun", "küçült"
- Add elements: "şapka ekle", "kuş ekle"
- Style changes: "daha renkli", "realistic yap"
- Background: "arkaplanı kaldır", "şeffaf arkaplan"

IMPORTANT - Format detection for edits:
- "png yap", "png olsun" → set format to "png"
- "jpg yap" → set format to "jpg"
- Other edits → keep format as null (don't change)`,
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
            description: 'New format if user wants to change it. Only set if user explicitly asks for format change.',
          },
        },
        required: ['modification'],
      },
    },
  },
];

/**
 * Result type for Function Calling response
 */
export interface FunctionCallResult {
  type: 'text' | 'function_call';
  content?: string;
  functionName?: string;
  functionArgs?: Record<string, any>;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface MessageContentPart {
  type: 'text' | 'image_url' | 'file_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContentPart[];
}

// ✅ SECURITY FIX: User-scoped context to prevent data leakage between users
interface UserContext {
  responseId: string | null;
  imageGenerationCallId: string | null;
  lastUsed: number;
}

// ✅ Type definitions for OpenAI messages
interface OpenAITextContent {
  type: 'text';
  text: string;
}

interface OpenAIImageContent {
  type: 'image_url';
  image_url: { url: string };
}

type OpenAIContentPart = OpenAITextContent | OpenAIImageContent;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string | OpenAIContentPart[];
}

@Injectable()
export class OpenAIAdapter {
  private client: OpenAI | null;
  // ✅ SECURITY FIX: Session-based context instead of shared instance variables
  private readonly contextStore = new Map<string, UserContext>();
  private readonly CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes TTL
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly logger = new Logger(OpenAIAdapter.name);

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('OPENAI_API_KEY');
    if (!key) {
      this.logger.warn(
        '⚠️  OpenAI API key not found - will use mock responses',
      );
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey: key });
    }

    // ✅ SECURITY FIX: Cleanup expired contexts every 10 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanupExpiredContexts(), 10 * 60 * 1000);
  }

  // ✅ SECURITY FIX: Get or create user-scoped context
  private getContext(sessionId: string): UserContext {
    let ctx = this.contextStore.get(sessionId);
    if (!ctx) {
      ctx = { responseId: null, imageGenerationCallId: null, lastUsed: Date.now() };
      this.contextStore.set(sessionId, ctx);
    }
    ctx.lastUsed = Date.now();
    return ctx;
  }

  // ✅ SECURITY FIX: Cleanup expired contexts to prevent memory leaks
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
      this.logger.debug(`[OpenAI] Cleaned up ${cleaned} expired contexts`);
    }
  }

  // ✅ Save base64 image to file and return URL
  private async saveBase64ToFile(base64Data: string): Promise<string> {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filename = `img_${randomUUID()}.png`;
    const filepath = path.join(uploadsDir, filename);
    
    // Save base64 to file
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    // Return URL (assumes backend serves /uploads statically)
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:4000';
    return `${backendUrl}/uploads/${filename}`;
  }

  /**
   * Convert localhost URLs to base64 data URLs
   * OpenAI cannot access localhost URLs, so we need to convert them
   */
  private async convertImageUrlToBase64(url: string): Promise<string> {
    // Already base64, return as-is
    if (url.startsWith('data:image/')) {
      return url;
    }
    
    // Localhost URL - fetch and convert to base64
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      try {
        this.logger.log(`[OpenAI] Converting localhost URL to base64: ${url.substring(0, 50)}...`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/png';
        return `data:${contentType};base64,${base64}`;
      } catch (error) {
        this.logger.error(`[OpenAI] Failed to fetch localhost image: ${url}`, error);
        // Return original URL as fallback
        return url;
      }
    }
    
    // Public URL - can be used directly by OpenAI
    return url;
  }

  // ✅ DRY: Single helper function for message conversion (Chat Completions API)
  // Async to support localhost URL to base64 conversion
  private async convertToOpenAIMessagesAsync(messages: ChatMessage[]): Promise<OpenAIMessage[]> {
    const results: OpenAIMessage[] = [];
    
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        results.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const contentParts: OpenAIContentPart[] = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            contentParts.push({ type: 'text', text: part.text });
          } else if (part.type === 'image_url' && part.image_url) {
            const convertedUrl = await this.convertImageUrlToBase64(part.image_url.url);
            contentParts.push({ type: 'image_url', image_url: { url: convertedUrl } });
          }
        }
        results.push({ role: msg.role, content: contentParts });
      } else {
        results.push({ role: msg.role, content: String(msg.content) });
      }
    }
    
    return results;
  }

  // Sync version for backward compatibility (no URL conversion)
  private convertToOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const content = msg.content
          .map((part): OpenAIContentPart | null => {
            if (part.type === 'text' && part.text) {
              return { type: 'text', text: part.text };
            }
            if (part.type === 'image_url' && part.image_url) {
              return { type: 'image_url', image_url: { url: part.image_url.url } };
            }
            return null;
          })
          .filter((p): p is OpenAIContentPart => p !== null);
        return { role: msg.role, content };
      }
      return { role: msg.role, content: String(msg.content) };
    }) as OpenAIMessage[];
  }

  // ✅ DRY: Async helper for Responses API format with URL conversion
  private async convertToResponsesAPIFormatAsync(messages: ChatMessage[]): Promise<any[]> {
    const results: any[] = [];
    
    for (const msg of messages) {
      const role = msg.role === 'system' ? 'developer' : msg.role;
      
      if (typeof msg.content === 'string') {
        results.push({ role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const contentParts: any[] = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            contentParts.push({ type: 'input_text', text: part.text });
          } else if (part.type === 'image_url' && part.image_url) {
            // ✅ FIX: Assistant messages can't have input_image in Responses API
            // Only user/developer messages can include images
            if (msg.role === 'assistant') {
              // For assistant messages with images, add as text description
              contentParts.push({ 
                type: 'output_text', 
                text: '[Previously generated image is visible in this conversation]' 
              });
            } else {
              // For user messages, convert localhost URLs to base64 and include as image
              const convertedUrl = await this.convertImageUrlToBase64(part.image_url.url);
              contentParts.push({ type: 'input_image', image_url: convertedUrl });
            }
          }
        }
        results.push({ role, content: contentParts });
      } else {
        results.push({ role, content: String(msg.content) });
      }
    }
    
    return results;
  }

  // Sync version for backward compatibility
  private convertToResponsesAPIFormat(messages: ChatMessage[]): any[] {
    return messages.map((msg) => {
      const role = msg.role === 'system' ? 'developer' : msg.role;
      if (typeof msg.content === 'string') {
        return { role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const content = msg.content
          .map((part) => {
            if (part.type === 'text' && part.text) {
              return { type: 'input_text', text: part.text };
            }
            if (part.type === 'image_url' && part.image_url) {
              // ✅ FIX: Assistant messages can't have input_image in Responses API
              if (msg.role === 'assistant') {
                return { type: 'output_text', text: '[Previously generated image]' };
              }
              return { type: 'input_image', image_url: part.image_url.url };
            }
            return null;
          })
          .filter(Boolean);
        return { role, content };
      }
      return { role, content: String(msg.content) };
    });
  }

  async chat(
    messages: ChatMessage[],
    model: string = 'gpt-4o',
    mode?: string,
    sessionId?: string, // ✅ SECURITY FIX: Add sessionId for user-scoped context
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    try {
      if (!this.client) {
        throw new Error(
          'OpenAI client not initialized. Please check OPENAI_API_KEY in .env file',
        );
      }

      if (model.startsWith('gpt-5')) {
        // For GPT-5, use Responses API with sessionId
        const content = await this.chatGPT5(messages, model, mode, sessionId);
        return { content };
      }

      // ✅ DRY: Use helper function for message conversion
      const openAIMessages = this.convertToOpenAIMessages(messages);

      // System prompt'u başa ekle
      const messagesWithSystem: OpenAIMessage[] = [
        { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
        ...openAIMessages,
      ];

      const response = await (this.client as any).chat.completions.create({
        model: model,
        messages: messagesWithSystem,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      const content = response.choices[0].message.content || '';
      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens || 0,
        completionTokens: response.usage.completion_tokens || 0,
      } : undefined;

      return { content, usage };
    } catch (error: unknown) {
      this.logger.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * ✅ ChatGPT-style Function Calling for GPT-4o
   * 
   * Instead of keyword detection, we let the AI decide:
   * - If user wants an image → AI calls generate_image/edit_image function
   * - If user wants text → AI responds with text
   * 
   * Works for ALL languages without keyword lists!
   * "kedi çiz" = "draw a cat" = "یه گربه بکش" - AI understands all!
   * 
   * @param messages - Conversation history
   * @param model - GPT model to use (GPT-4o recommended)
   * @param hasRecentImage - Whether there's a recent image in conversation (for edit context)
   * @param sessionId - Session ID for context management
   * @returns FunctionCallResult - Either text response or function call details
   */
  async chatWithFunctionCalling(
    messages: ChatMessage[],
    model: string = 'gpt-4o',
    hasRecentImage: boolean = false,
    sessionId?: string,
  ): Promise<FunctionCallResult> {
    try {
      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      // For GPT-5, use native Responses API with image_generation tool
      if (model.startsWith('gpt-5')) {
        return this.chatWithFunctionCallingGPT5(messages, model, hasRecentImage, sessionId);
      }

      // ✅ GPT-4o: Use Chat Completions API with Function Calling
      const openAIMessages = this.convertToOpenAIMessages(messages);
      
      // Build system prompt with context about recent image
      let systemPrompt = CHATGPT_SYSTEM_PROMPT;
      if (hasRecentImage) {
        systemPrompt += `\n\nNOTE: There is a recently generated image in this conversation. 
If the user's message seems to be a modification request (like "make it bigger", "add something", "change color"), 
use the edit_image function. Short messages after image generation are often edit requests.`;
      }

      const messagesWithSystem: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        ...openAIMessages,
      ];

      this.logger.log(`[FunctionCalling] Sending to GPT-4o with ${FUNCTION_CALLING_TOOLS.length} tools, hasRecentImage: ${hasRecentImage}`);

      const response = await (this.client as any).chat.completions.create({
        model,
        messages: messagesWithSystem,
        tools: FUNCTION_CALLING_TOOLS,
        tool_choice: 'auto', // ✅ Let AI decide when to use tools
        max_tokens: 4096,
        temperature: 0.7,
      });

      const choice = response.choices[0];
      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens || 0,
        completionTokens: response.usage.completion_tokens || 0,
      } : undefined;

      // Check if AI decided to call a function
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

        this.logger.log(`[FunctionCalling] ✅ AI decided to call: ${functionName}`);
        this.logger.log(`[FunctionCalling] Args: ${JSON.stringify(functionArgs)}`);

        return {
          type: 'function_call',
          functionName,
          functionArgs,
          usage,
        };
      }

      // AI decided to respond with text (no image request detected)
      const content = choice.message.content || '';
      this.logger.log(`[FunctionCalling] AI responded with text (no function call)`);

      return {
        type: 'text',
        content,
        usage,
      };
    } catch (error: unknown) {
      this.logger.error('[FunctionCalling] Error:', error);
      throw new Error(`Function Calling Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * ✅ GPT-5.2 version of Function Calling using native Responses API
   * GPT-5.2 has native image_generation tool, no need for DALL-E separate call
   */
  private async chatWithFunctionCallingGPT5(
    messages: ChatMessage[],
    model: string = 'gpt-5.2',
    hasRecentImage: boolean = false,
    sessionId?: string,
  ): Promise<FunctionCallResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const ctx = sessionId 
      ? this.getContext(sessionId) 
      : { responseId: null, imageGenerationCallId: null, lastUsed: Date.now() };

    // Build system prompt
    let systemPrompt = CHATGPT_SYSTEM_PROMPT;
    if (hasRecentImage) {
      systemPrompt += `\n\nNOTE: There is a recently generated image in this conversation. 
If the user wants to modify it, generate a new version with the requested changes.`;
    }

    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const inputMessages = this.convertToResponsesAPIFormat(messagesWithSystem);
    const baseModel = this.getBaseModel(model);

    this.logger.log(`[FunctionCalling GPT-5] Model: ${baseModel}, hasRecentImage: ${hasRecentImage}`);

    // ✅ Key: Always include image_generation tool, but with tool_choice: 'auto'
    // AI decides when to generate images - no keyword detection needed!
    const requestParams: any = {
      model: baseModel,
      input: inputMessages.slice(-50), // Keep last 50 messages for context
      tools: [
        {
          type: 'image_generation',
          quality: 'high',
          background: 'auto',
        },
      ],
      // ✅ NO tool_choice: 'required' - let AI decide naturally!
      store: true,
    };

    // Add reasoning effort for thinking models
    const effort = this.getReasoningEffort(model);
    if (effort) {
      requestParams.reasoning = { effort };
    }

    // If we have previous image context and user might be editing, add it
    if (hasRecentImage && ctx.responseId) {
      requestParams.previous_response_id = ctx.responseId;
      this.logger.log(`[FunctionCalling GPT-5] Using previous_response_id: ${ctx.responseId}`);
    }

    try {
      const response = await (this.client as any).responses.create(requestParams);

      // Store new response ID
      ctx.responseId = response.id;

      // Check if AI generated an image
      const imageCall = (response.output || []).find(
        (o: any) => o.type === 'image_generation_call',
      );

      if (imageCall && imageCall.result) {
        // AI decided to generate an image
        ctx.imageGenerationCallId = imageCall.id;
        
        this.logger.log(`[FunctionCalling GPT-5] ✅ AI generated image - responseId: ${response.id}`);

        return {
          type: 'function_call',
          functionName: hasRecentImage ? 'edit_image' : 'generate_image',
          functionArgs: {
            imageBase64: imageCall.result,
            responseId: response.id,
            imageCallId: imageCall.id,
            revisedPrompt: imageCall.revised_prompt || '',
          },
        };
      }

      // AI responded with text
      const textContent = response.output_text || '';
      this.logger.log(`[FunctionCalling GPT-5] AI responded with text`);

      return {
        type: 'text',
        content: textContent,
      };
    } catch (error: any) {
      // Handle context length errors with truncation
      if (error?.code === 'context_length_exceeded' || 
          /context_length_exceeded/i.test(error?.message || '')) {
        this.logger.warn('[FunctionCalling GPT-5] Context too long, retrying with less history');
        requestParams.input = inputMessages.slice(-10);
        
        const response = await (this.client as any).responses.create(requestParams);
        ctx.responseId = response.id;

        const imageCall = (response.output || []).find(
          (o: any) => o.type === 'image_generation_call',
        );

        if (imageCall && imageCall.result) {
          ctx.imageGenerationCallId = imageCall.id;
          return {
            type: 'function_call',
            functionName: hasRecentImage ? 'edit_image' : 'generate_image',
            functionArgs: {
              imageBase64: imageCall.result,
              responseId: response.id,
              imageCallId: imageCall.id,
              revisedPrompt: imageCall.revised_prompt || '',
            },
          };
        }

        return {
          type: 'text',
          content: response.output_text || '',
        };
      }

      throw error;
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model: string = 'gpt-4o',
    sessionId?: string, // ✅ SECURITY FIX: Add sessionId for user-scoped context
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      if (model.startsWith('gpt-5')) {
        // ✅ GPT-5.2 - önce "düşünüyor" göster, sonra yanıtı al
        this.logger.log(`[OpenAI] Starting GPT-5 request for model: ${model}`);

        let full = await this.chatGPT5(messages, model, undefined, sessionId);
        
        // ✅ ChatGPT-style: If response contains base64 image, save to file and convert to URL
        if (full.includes('![Generated Image](data:image/png;base64,')) {
          const base64Match = full.match(/!\[Generated Image\]\(data:image\/png;base64,([^)]+)\)/);
          if (base64Match && base64Match[1]) {
            const base64Data = base64Match[1];
            const imageUrl = await this.saveBase64ToFile(base64Data);
            full = full.replace(
              /!\[Generated Image\]\(data:image\/png;base64,[^)]+\)/,
              `![Generated Image](${imageUrl})`
            );
            this.logger.log(`[OpenAI] Converted base64 image to file URL: ${imageUrl}`);
          }
        }
        
        await this.simulateStreaming(full, onChunk);
        return;
      }

      // ✅ DRY: Use async helper for message conversion (converts localhost URLs to base64)
      const openAIMessages = await this.convertToOpenAIMessagesAsync(messages);

      // System prompt'u başa ekle
      const messagesWithSystem: OpenAIMessage[] = [
        { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
        ...openAIMessages,
      ];

      // Use any to bypass strict type checking for now as we manually constructed valid messages
      const stream = await (this.client as any).chat.completions.create({
        model: model,
        messages: messagesWithSystem,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      let chunkCount = 0;
      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chunkCount++;
          fullResponse += content;
          onChunk(content);
        }
      }

      // ✅ If model sent response in very few chunks (not real streaming), simulate it
      if (chunkCount < 3 && fullResponse.length > 100) {
        this.logger.log(
          `[OpenAI] Model ${model} sent ${chunkCount} chunks (${fullResponse.length} chars), not real streaming`,
        );
        // Already sent to client, no need to resend
      }
    } catch (error: unknown) {
      this.logger.error('OpenAI Stream Error:', error);
      throw new Error(`AI Provider Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ✅ Simulate word-by-word streaming for models that don't support it
  // ✅ 30ms delay for natural ChatGPT-like typing effect
  private async simulateStreaming(
    text: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      onChunk(word);
      // ✅ 30ms delay for natural typing effect (ChatGPT-like speed)
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  // ------------------------------
  // GPT-5.2 — RESPONSES API
  // ------------------------------
  // ✅ REFACTOR: Simplified with object lookup
  private getReasoningEffort(
    model: string,
  ): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    const effortMap: Record<string, 'minimal' | 'low' | 'medium' | 'high' | undefined> = {
      'gpt-5.2-instant': 'minimal',
      'gpt-5.2-auto': 'medium',
      'gpt-5.2': 'medium',
      'gpt-5.2-thinking': 'high',
      'gpt-5.2-pro': undefined,
    };
    return effortMap[model] ?? undefined;
  }

  private getBaseModel(model: string): string {
    // Map frontend model IDs to actual OpenAI model names
    if (
      model === 'gpt-5.2-auto' ||
      model === 'gpt-5.2-instant' ||
      model === 'gpt-5.2-thinking' ||
      model === 'gpt-5.2'
    ) {
      return 'gpt-5.2';
    }
    if (model === 'gpt-5.2-pro') {
      return 'gpt-5.2-pro';
    }
    return model;
  }

  private async chatGPT5(
    messages: ChatMessage[],
    model: string = 'gpt-5.2',
    mode?: string,
    sessionId?: string, // ✅ SECURITY FIX: Add sessionId for user-scoped context
  ) {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    // ✅ SECURITY FIX: Get user-scoped context
    const ctx = sessionId 
      ? this.getContext(sessionId) 
      : { responseId: null, imageGenerationCallId: null, lastUsed: Date.now() };

    // System prompt'u başa ekle
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
      ...messages,
    ];

    // ✅ DRY: Use async helper for message conversion (converts localhost URLs to base64)
    const inputMessages = await this.convertToResponsesAPIFormatAsync(messagesWithSystem);

    const baseModel = this.getBaseModel(model);
    const effort = this.getReasoningEffort(model);

    this.logger.log(
      `[GPT-5] Model: ${baseModel}, Reasoning Effort: ${effort}, Original Model ID: ${model}, Mode: ${mode}`,
    );

    // Build base request params
    const requestParams: any = {
      model: baseModel,
    };

    // Add reasoning effort if applicable
    if (effort) {
      requestParams.reasoning = { effort };
    }

    // ✅ Kullanıcının son mesajını al (image parametrelerini belirlemek için)
    const lastUserMessage = messages
      .filter(m => m.role === 'user')
      .map(m => typeof m.content === 'string' ? m.content : '')
      .pop()?.toLowerCase() || '';

    // ✅ Şeffaf arka plan isteniyor mu kontrol et
    const transparentKeywords = [
      'şeffaf', 'transparent', 'arka plan olmasın', 'arka planı olmasın',
      'arka plansız', 'arkaplan olmasın', 'arkaplanı olmasın', 'arkalansız',
      'no background', 'without background', 'remove background',
      'بدون پس‌زمینه', 'بدون بک‌گراند', 'شفاف'
    ];
    const wantsTransparent = transparentKeywords.some(kw => lastUserMessage.includes(kw));

    // ✅ Yüksek kalite isteniyor mu kontrol et
    const highQualityKeywords = [
      'yüksek kalite', 'high quality', 'hd', '4k', 'detaylı', 'detailed',
      'کیفیت بالا', 'با کیفیت'
    ];
    const wantsHighQuality = highQualityKeywords.some(kw => lastUserMessage.includes(kw));

    // ✅ FIX: image_generation tool'u sadece mode === 'image' olduğunda ekle
    // Önceki yaklaşım (her zaman ekle, GPT karar versin) sorunlara yol açıyordu:
    // - GPT önceki görsel context'ini yanlış kullanıyordu
    // - "kedi" yazınca "at" çiziyordu (önceki görsel context'inden)
    // Şimdi: Kullanıcı görsel istiyorsa image mode seçmeli
    if (mode === 'image') {
      requestParams.tools = [
        {
          type: 'image_generation',
          quality: 'high',
          background: wantsTransparent ? 'transparent' : 'auto',
        },
      ];
      requestParams.tool_choice = 'required'; // Görsel modunda mutlaka görsel oluştur
      this.logger.log('[GPT-5 Image] Image mode active - tool_choice: required');
    }

    if (wantsTransparent) {
      this.logger.log('[GPT-5 Image] User requested transparent background');
    }
    if (wantsHighQuality) {
      this.logger.log('[GPT-5 Image] User requested high quality image');
    }

    // Optionally enable web_search tool when requested via mode and flag
    if (mode === 'web' && this.configService.get<string>('OPENAI_RESPONSES_WEB_TOOL') === 'true') {
      requestParams.tools = [
        ...requestParams.tools,
        { type: 'web_search' },
      ];
    }

    // ✅ FIX: previous_response_id KULLANMA - karışıklığa yol açıyor
    // Problem: Kullanıcı "kedi" dediğinde, önceki "at" görselinin context'i
    // taşınıyor ve GPT yanlış sonuç üretiyor.
    // ChatGPT'nin conversation memory'si mesaj history'den geliyor,
    // previous_response_id'den değil. Bu ID sadece çok spesifik durumlarda kullanılmalı.
    // if (ctx.responseId && mode !== 'image') {
    //   requestParams.previous_response_id = ctx.responseId;
    // }

    // Multi-turn image editing: image_generation_call sadece EXPLICIT image mode'da kullanılacak
    // Bu da sadece handleImageRequest üzerinden edit yapıldığında aktif olur
    if (mode === 'image' && ctx.imageGenerationCallId) {
      this.logger.log(
        `[GPT-5 Image] Multi-turn: using previous image_generation_call.id: ${ctx.imageGenerationCallId}`,
      );
    }

    // System/developer message is always first; the rest is conversation history
    const systemMsg = inputMessages[0];
    const convMessages = inputMessages.slice(1);

    // Truncation attempts: keep last N conversation messages on each retry
    const truncationAttempts = [100, 50, 30, 20, 12, 8, 4, 2];
    let lastError: any = null;

    for (const keep of truncationAttempts) {
      try {
        const toSend: any[] = [systemMsg, ...convMessages.slice(-keep)];

        // ✅ SECURITY FIX: Use session-scoped context
        if (mode === 'image' && ctx.imageGenerationCallId) {
          toSend.push({
            type: 'image_generation_call',
            id: ctx.imageGenerationCallId,
          });
          this.logger.log(
            `[GPT-5 Image] Added image_generation_call reference to input for multi-turn editing`,
          );
        }

        requestParams.input = toSend;

        this.logger.log(
          `[GPT-5] Attempting Responses.create with last ${Math.min(keep, convMessages.length)} conv messages (total items: ${toSend.length})`,
        );

        const response = await (this.client as any).responses.create(
          requestParams,
        );

        // ✅ SECURITY FIX: Store in session-scoped context
        ctx.responseId = response.id;

        // Check for image generation
        const imageGenerationCalls = (response.output || []).filter(
          (o: any) => o.type === 'image_generation_call',
        );

        if (imageGenerationCalls.length > 0 && imageGenerationCalls[0].result) {
          const imageBase64 = imageGenerationCalls[0].result;
          const revisedPrompt = imageGenerationCalls[0].revised_prompt || '';

          // ✅ SECURITY FIX: Store in session-scoped context
          if (imageGenerationCalls[0].id) {
            ctx.imageGenerationCallId = imageGenerationCalls[0].id;
            this.logger.log(
              `[GPT-5 Image] Stored image_generation_call.id for multi-turn: ${ctx.imageGenerationCallId}`,
            );
          }

          this.logger.log(
            `[GPT-5 Image] Generated image with revised prompt: ${revisedPrompt}`,
          );

          return `![Generated Image](data:image/png;base64,${imageBase64})`;
        }

        return response.output_text || 'No response';
      } catch (err: any) {
        lastError = err;
        const code = err?.code || err?.error?.code;
        const message = String(err?.message || '');

        // If context length exceeded, retry with smaller history
        if (
          code === 'context_length_exceeded' ||
          /context window/i.test(message) ||
          /context_length_exceeded/i.test(message)
        ) {
          this.logger.warn(
            `[GPT-5] context_length_exceeded with keep=${keep}. Retrying with less history...`,
          );
          continue;
        }

        // For other errors, throw immediately
        this.logger.error('[GPT-5] Responses API error (non-context):', err);
        throw err;
      }
    }

    // Last resort: send only system + the very last message
    try {
      const minimal = [systemMsg, convMessages[convMessages.length - 1]].filter(
        Boolean,
      );
      requestParams.input = minimal;
      this.logger.warn(
        `[GPT-5] All truncation attempts failed. Sending minimal context (items: ${minimal.length})`,
      );
      const response = await (this.client as any).responses.create(
        requestParams,
      );
      // ✅ SECURITY FIX: Store in session-scoped context
      ctx.responseId = response.id;

      const imageGenerationCalls = (response.output || []).filter(
        (o: any) => o.type === 'image_generation_call',
      );

      if (imageGenerationCalls.length > 0 && imageGenerationCalls[0].result) {
        const imageBase64 = imageGenerationCalls[0].result;
        const revisedPrompt = imageGenerationCalls[0].revised_prompt || '';

        this.logger.log(
          `[GPT-5 Image] Generated image with revised prompt: ${revisedPrompt}`,
        );

        return `![Generated Image](data:image/png;base64,${imageBase64})`;
      }

      return response.output_text || 'No response';
    } catch (finalErr: any) {
      this.logger.error('[GPT-5] Final minimal attempt also failed:', finalErr);
      throw (
        finalErr ||
        lastError ||
        new Error('GPT-5 Responses API failed after truncation')
      );
    }
  }

  // ------------------------------
  // Structured Outputs
  // ------------------------------
  async chatStructured(
    messages: ChatMessage[],
    schemaName: SchemaName,
    model: string = 'gpt-4o-2024-08-06',
  ): Promise<any> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const schema = SCHEMAS[schemaName];
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    this.logger.log(
      `[Structured] Using schema: ${schemaName}, model: ${model}`,
    );

    // Convert messages to Responses API format
    const inputMessages = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role === 'system' ? 'developer' : msg.role,
          content: msg.content,
        };
      }
      return {
        role: msg.role === 'system' ? 'developer' : msg.role,
        content: Array.isArray(msg.content)
          ? JSON.stringify(msg.content)
          : String(msg.content),
      };
    });

    const response = await (this.client as any).responses.parse({
      model,
      input: inputMessages,
      text: {
        format: zodTextFormat(schema, schemaName),
      },
    });

    // Check for refusal
    const refusalContent = response.output.find(
      (o: any) =>
        o.type === 'message' &&
        o.content?.some((c: any) => c.type === 'refusal'),
    );

    if (refusalContent) {
      const refusal = refusalContent.content.find(
        (c: any) => c.type === 'refusal',
      );
      this.logger.log(`[Structured] Model refused: ${refusal.refusal}`);
      throw new Error(`Model refused: ${refusal.refusal}`);
    }

    // Return parsed data
    return response.output_parsed;
  }

  /**
   * ✅ SECURITY FIX: Clear conversation context for a specific session
   * Call this when starting a new conversation to ensure clean state
   */
  clearContext(sessionId?: string): void {
    if (sessionId) {
      this.contextStore.delete(sessionId);
      this.logger.log(`[OpenAI] Cleared context for session: ${sessionId}`);
    } else {
      // Legacy: clear all (for backwards compatibility)
      this.contextStore.clear();
      this.logger.log('[OpenAI] Cleared all conversation contexts');
    }
  }

  /**
   * ✅ SECURITY FIX: Clear only the image generation context for a session
   * Useful when you want to keep conversation but start fresh image generation
   */
  clearImageContext(sessionId?: string): void {
    if (sessionId) {
      const ctx = this.contextStore.get(sessionId);
      if (ctx) {
        ctx.imageGenerationCallId = null;
      }
    }
    this.logger.log(`[OpenAI] Cleared image generation context${sessionId ? ` for session: ${sessionId}` : ''}`);
  }

  /**
   * Get current image generation call ID for a session (for debugging/testing)
   */
  getLastImageGenerationCallId(sessionId?: string): string | null {
    if (sessionId) {
      return this.contextStore.get(sessionId)?.imageGenerationCallId || null;
    }
    return null;
  }

  /**
   * ✅ Cleanup on module destroy - clear interval to prevent memory leaks
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.contextStore.clear();
    this.logger.log('[OpenAI] Module destroyed, cleaned up all contexts');
  }

  // ------------------------------
  // Deep Research (Responses API)
  // ------------------------------
  /**
   * Kick off a Deep Research task in background mode.
   * Uses o3-deep-research by default and attaches web_search_preview.
   */
  async startDeepResearch(
    input: string,
    options?: {
      model?: 'o3-deep-research' | 'o4-mini-deep-research';
      useWebSearch?: boolean;
      useCodeInterpreter?: boolean;
      vectorStoreIds?: string[];
    },
  ): Promise<{ id: string }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const model = options?.model || 'o3-deep-research';
    const tools: any[] = [];

    // At least one data source is required
    if (options?.useWebSearch !== false) {
      tools.push({ type: 'web_search_preview' });
    }
    if (options?.vectorStoreIds && options.vectorStoreIds.length > 0) {
      tools.push({
        type: 'file_search',
        vector_store_ids: options.vectorStoreIds,
      });
    }
    if (options?.useCodeInterpreter) {
      tools.push({ type: 'code_interpreter', container: { type: 'auto' } });
    }

    if (tools.length === 0) {
      // Ensure at least web search is enabled
      tools.push({ type: 'web_search_preview' });
    }

    const resp = await (this.client as any).responses.create({
      model,
      input,
      background: true,
      tools,
    });

    this.logger.log(
      `[DeepResearch] Started: id=${resp.id}, model=${model}, tools=${tools.map((t) => t.type).join(',')}`,
    );
    return { id: resp.id };
  }

  /**
   * Poll Deep Research task status and return structured data.
   */
  async getDeepResearchStatus(id: string): Promise<{
    id: string;
    status: string;
    output_text?: string;
    output?: any[];
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const resp = await (this.client as any).responses.get(id);
    const status = resp?.status || 'unknown';
    const output_text = resp?.output_text;
    const output = resp?.output || [];

    this.logger.log(
      `[DeepResearch] Status: id=${id}, status=${status}, items=${Array.isArray(output) ? output.length : 0}`,
    );

    return { id, status, output_text, output };
  }

  // ------------------------------
  // Image Generation (GPT-5.2 Responses API)
  // ChatGPT-style multi-turn image editing
  // ------------------------------

  /**
   * Translate Turkish image prompts to English for accurate generation
   * OpenAI image generation works much better with English prompts
   */
  private enhancePromptForImageGeneration(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase().trim();
    
    // Direct Turkish to English translations for common words
    const translations: Record<string, string> = {
      // Böcekler / Insects
      'sinek': 'a fly (insect)',
      'sivrisinek': 'a mosquito',
      'uğur böceği': 'a ladybug - red beetle with black spots',
      'ugur bocegi': 'a ladybug - red beetle with black spots',
      'uğurböceği': 'a ladybug - red beetle with black spots',
      'kelebek': 'a butterfly',
      'arı': 'a bee',
      'karınca': 'an ant',
      'örümcek': 'a spider',
      'kırkayak': 'a centipede',
      'solucan': 'an earthworm',
      'salyangoz': 'a snail',
      'ağustos böceği': 'a cicada',
      'böcek': 'an insect',
      'hamam böceği': 'a cockroach',
      'çekirge': 'a grasshopper',
      'yusufçuk': 'a dragonfly',
      'ateş böceği': 'a firefly',
      'kın kanatlı': 'a beetle',
      
      // Hayvanlar / Animals
      'kedi': 'a cat',
      'köpek': 'a dog',
      'kuş': 'a bird',
      'balık': 'a fish',
      'at': 'a horse',
      'inek': 'a cow',
      'tavuk': 'a chicken',
      'horoz': 'a rooster',
      'fare': 'a mouse',
      'sıçan': 'a rat',
      'tavşan': 'a rabbit',
      'aslan': 'a lion',
      'kaplan': 'a tiger',
      'fil': 'an elephant',
      'zürafa': 'a giraffe',
      'maymun': 'a monkey',
      'ayı': 'a bear',
      'kurt': 'a wolf',
      'tilki': 'a fox',
      'geyik': 'a deer',
      'penguen': 'a penguin',
      'yunus': 'a dolphin',
      'balina': 'a whale',
      'köpekbalığı': 'a shark',
      'timsah': 'a crocodile',
      'yılan': 'a snake',
      'kaplumbağa': 'a turtle',
      'kurbağa': 'a frog',
      'ördek': 'a duck',
      'kaz': 'a goose',
      'kuğu': 'a swan',
      'kartal': 'an eagle',
      'baykuş': 'an owl',
      'papağan': 'a parrot',
      'serçe': 'a sparrow',
      'güvercin': 'a pigeon',
      'karga': 'a crow',
      'sincap': 'a squirrel',
      'kirpi': 'a hedgehog',
      'domuz': 'a pig',
      'koyun': 'a sheep',
      'keçi': 'a goat',
      'eşek': 'a donkey',
      'deve': 'a camel',
      'leopar': 'a leopard',
      'jaguar': 'a jaguar',
      'panda': 'a panda',
      'koala': 'a koala',
      'kanguru': 'a kangaroo',
      'zebra': 'a zebra',
      'gergedan': 'a rhinoceros',
      'su aygırı': 'a hippopotamus',
      
      // Fiiller / Verbs
      'çiz': 'draw',
      'yap': 'create',
      'oluştur': 'generate',
      'göster': 'show',
      
      // Sıfatlar / Adjectives  
      'güzel': 'beautiful',
      'büyük': 'big',
      'küçük': 'small',
      'renkli': 'colorful',
      'sevimli': 'cute',
      'gerçekçi': 'realistic',
      'karikatür': 'cartoon style',
      'anime': 'anime style',
    };

    let result = lowerPrompt;
    
    // Sort by length descending to match longer phrases first
    const sortedKeys = Object.keys(translations).sort((a, b) => b.length - a.length);
    
    // ✅ FIX: Use word boundary matching to prevent partial replacements
    // Problem: "kedi" → "a cat" → "a ca horse" (because "at" in "cat" matched "at": "a horse")
    for (const turkish of sortedKeys) {
      // Use word boundary regex to match whole words only
      const wordBoundaryRegex = new RegExp(`\\b${turkish}\\b`, 'gi');
      if (wordBoundaryRegex.test(result)) {
        result = result.replace(wordBoundaryRegex, translations[turkish]);
      }
    }
    
    // If nothing was translated, add instruction to interpret as Turkish
    if (result === lowerPrompt) {
      result = `[Turkish prompt, interpret literally]: ${prompt}`;
    }
    
    return result;
  }

  /**
   * Generate a new image using GPT-5.2 Responses API
   * Returns image data + context for multi-turn editing
   */
  async generateImage(
    prompt: string,
    sessionId: string,
    model: string = 'gpt-5.2',
  ): Promise<{
    imageBase64: string;
    responseId: string;
    imageCallId: string;
    revisedPrompt: string;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    // Enhance Turkish prompts for better understanding
    const enhancedPrompt = this.enhancePromptForImageGeneration(prompt);
    this.logger.log(`[Image Generation] Original: "${prompt}"`);
    this.logger.log(`[Image Generation] Enhanced: "${enhancedPrompt}"`);
    this.logger.log(`[Image Generation] Model: ${this.getBaseModel(model)}`);

    try {
      const response = await (this.client as any).responses.create({
        model: this.getBaseModel(model),
        input: `Generate an image: ${enhancedPrompt}`,
        tools: [{ type: 'image_generation', quality: 'high', background: 'auto' }],
        tool_choice: 'required', // ✅ Force image generation, don't ask questions
        store: true, // Required for multi-turn
      });

      // Find image_generation_call in output
      const imageCall = (response.output || []).find(
        (o: any) => o.type === 'image_generation_call',
      );

      if (!imageCall || !imageCall.result) {
        this.logger.error('[Image Generation] No image in response:', JSON.stringify(response, null, 2));
        throw new Error('Image generation failed - no image returned');
      }

      // Store context for this session
      const ctx = this.getContext(sessionId);
      ctx.responseId = response.id;
      ctx.imageGenerationCallId = imageCall.id;

      this.logger.log(`[Image Generation] Success - responseId: ${response.id}, callId: ${imageCall.id}`);

      return {
        imageBase64: imageCall.result,
        responseId: response.id,
        imageCallId: imageCall.id,
        revisedPrompt: imageCall.revised_prompt || prompt,
      };
    } catch (error: any) {
      this.logger.error('[Image Generation] OpenAI API Error:', error?.message || error);
      this.logger.error('[Image Generation] Error details:', JSON.stringify({
        status: error?.status,
        code: error?.code,
        type: error?.type,
        message: error?.message,
      }, null, 2));
      throw error;
    }
  }

  /**
   * Edit an existing image using previous_response_id (multi-turn)
   * This is ChatGPT's approach for "make it more realistic" etc.
   */
  async editImage(
    modification: string,
    previousResponseId: string,
    sessionId: string,
    model: string = 'gpt-5.2',
  ): Promise<{
    imageBase64: string;
    responseId: string;
    imageCallId: string;
    revisedPrompt: string;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log(`[Image Edit] Modification: "${modification}", previousResponseId: ${previousResponseId}`);

    // Enhance Turkish prompts for better understanding
    const enhancedModification = this.enhancePromptForImageGeneration(modification);
    if (enhancedModification !== modification) {
      this.logger.log(`[Image Edit] Enhanced: "${enhancedModification}"`);
    }

    const response = await (this.client as any).responses.create({
      model: this.getBaseModel(model),
      input: `Edit the image: ${enhancedModification}`,
      previous_response_id: previousResponseId, // ✅ Key for ChatGPT-style multi-turn!
      tools: [{ type: 'image_generation', quality: 'high', background: 'auto' }],
      tool_choice: 'required', // ✅ Force image generation
      store: true,
    });

    const imageCall = (response.output || []).find(
      (o: any) => o.type === 'image_generation_call',
    );

    if (!imageCall || !imageCall.result) {
      this.logger.error('[Image Edit] No image in response:', response);
      throw new Error('Image edit failed - no image returned');
    }

    // Update context
    const ctx = this.getContext(sessionId);
    ctx.responseId = response.id;
    ctx.imageGenerationCallId = imageCall.id;

    this.logger.log(`[Image Edit] Success - new responseId: ${response.id}, callId: ${imageCall.id}`);

    return {
      imageBase64: imageCall.result,
      responseId: response.id,
      imageCallId: imageCall.id,
      revisedPrompt: imageCall.revised_prompt || modification,
    };
  }

  /**
   * Alternative: Edit using image_generation_call.id reference
   * Use when you need to reference a specific image (multiple images in conversation)
   */
  async editImageByCallId(
    modification: string,
    imageCallId: string,
    sessionId: string,
    model: string = 'gpt-5.2',
  ): Promise<{
    imageBase64: string;
    responseId: string;
    imageCallId: string;
    revisedPrompt: string;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log(`[Image Edit by CallId] Modification: "${modification}", imageCallId: ${imageCallId}`);

    const response = await (this.client as any).responses.create({
      model: this.getBaseModel(model),
      input: [
        { role: 'user', content: [{ type: 'input_text', text: `Edit the image: ${modification}` }] },
        { type: 'image_generation_call', id: imageCallId }, // Direct reference
      ],
      tools: [{ type: 'image_generation', quality: 'high', background: 'auto' }],
      tool_choice: 'required', // ✅ Force image generation
      store: true,
    });

    const newImageCall = (response.output || []).find(
      (o: any) => o.type === 'image_generation_call',
    );

    if (!newImageCall || !newImageCall.result) {
      throw new Error('Image edit failed - no image returned');
    }

    const ctx = this.getContext(sessionId);
    ctx.responseId = response.id;
    ctx.imageGenerationCallId = newImageCall.id;

    return {
      imageBase64: newImageCall.result,
      responseId: response.id,
      imageCallId: newImageCall.id,
      revisedPrompt: newImageCall.revised_prompt || modification,
    };
  }

  /**
   * ✅ ChatGPT-style: Let GPT decide what to do
   * Don't force image generation - let GPT choose based on user's message
   * This is how ChatGPT handles follow-up messages after image generation
   */
  async smartImageRequest(
    userMessage: string,
    previousResponseId: string,
    sessionId: string,
    model: string = 'gpt-5.2',
  ): Promise<{
    hasImage: boolean;
    imageBase64?: string;
    responseId: string;
    imageCallId?: string;
    revisedPrompt?: string;
    textResponse?: string;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log(`[SmartImage] Message: "${userMessage}", prevResponseId: ${previousResponseId}`);

    // Enhance Turkish prompts
    const enhancedMessage = this.enhancePromptForImageGeneration(userMessage);
    if (enhancedMessage !== userMessage) {
      this.logger.log(`[SmartImage] Enhanced: "${enhancedMessage}"`);
    }

    // ✅ Key difference: NO tool_choice: 'required'
    // Let GPT decide whether to generate an image or respond with text
    const response = await (this.client as any).responses.create({
      model: this.getBaseModel(model),
      input: enhancedMessage,
      previous_response_id: previousResponseId, // ✅ Multi-turn context
      tools: [{ type: 'image_generation', quality: 'high', background: 'auto' }],
      // NO tool_choice - GPT decides!
      store: true,
    });

    // Check if GPT decided to generate an image
    const imageCall = (response.output || []).find(
      (o: any) => o.type === 'image_generation_call',
    );

    if (imageCall && imageCall.result) {
      // GPT chose to generate/edit image
      const ctx = this.getContext(sessionId);
      ctx.responseId = response.id;
      ctx.imageGenerationCallId = imageCall.id;

      this.logger.log(`[SmartImage] GPT generated image - responseId: ${response.id}`);

      return {
        hasImage: true,
        imageBase64: imageCall.result,
        responseId: response.id,
        imageCallId: imageCall.id,
        revisedPrompt: imageCall.revised_prompt || userMessage,
      };
    }

    // GPT chose to respond with text
    const textOutput = (response.output || []).find(
      (o: any) => o.type === 'message',
    );
    const textContent = textOutput?.content?.[0]?.text || '';

    this.logger.log(`[SmartImage] GPT chose text response: "${textContent.substring(0, 100)}..."`);

    return {
      hasImage: false,
      responseId: response.id,
      textResponse: textContent,
    };
  }
}
