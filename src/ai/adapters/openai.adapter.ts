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

  // ✅ DRY: Single helper function for message conversion (Chat Completions API)
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

  // ✅ DRY: Single helper function for Responses API format
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

      // ✅ DRY: Use helper function for message conversion
      const openAIMessages = this.convertToOpenAIMessages(messages);

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

    // ✅ DRY: Use helper function for message conversion
    const inputMessages = this.convertToResponsesAPIFormat(messagesWithSystem);

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

    // ✅ ChatGPT tarzı: Her zaman image_generation tool'u ekle
    // tool_choice default "auto" - GPT kendisi karar verir
    // Kullanıcı "çiz" derse → GPT görsel oluşturur
    // Kullanıcı "merhaba" derse → GPT metin döner
    // ✅ Default kalite HIGH - ChatGPT gibi yüksek kaliteli görseller
    requestParams.tools = [
      {
        type: 'image_generation',
        quality: 'high', // Always high quality like ChatGPT
        background: wantsTransparent ? 'transparent' : 'auto',
      },
    ];

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

    // ✅ SECURITY FIX: Use session-scoped context instead of shared instance variable
    if (ctx.responseId) {
      requestParams.previous_response_id = ctx.responseId;
    }

    // Multi-turn image editing: include last image_generation_call reference
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
    
    for (const turkish of sortedKeys) {
      if (result.includes(turkish)) {
        result = result.replace(new RegExp(turkish, 'gi'), translations[turkish]);
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
      this.logger.error('[Image Generation] No image in response:', response);
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
