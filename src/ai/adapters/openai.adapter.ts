import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCHEMAS, type SchemaName } from '../schemas/structured';

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

@Injectable()
export class OpenAIAdapter {
  private client: OpenAI | null;
  private lastResponseId: string | null = null;
  private lastImageGenerationCallId: string | null = null; // Multi-turn image editing
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
  }

  async chat(
    messages: ChatMessage[],
    model: string = 'gpt-4o',
    mode?: string,
  ): Promise<string> {
    try {
      if (!this.client) {
        throw new Error(
          'OpenAI client not initialized. Please check OPENAI_API_KEY in .env file',
        );
      }

      // Convert internal message format to OpenAI format
      const openAIMessages = messages.map((msg) => {
        if (typeof msg.content === 'string') {
          return { role: msg.role, content: msg.content };
        }
        // Handle rich content (array of parts)
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role,
            content: msg.content
              .map((part) => {
                if (part.type === 'text') {
                  return { type: 'text', text: part.text };
                }
                if (part.type === 'image_url' && part.image_url) {
                  return {
                    type: 'image_url',
                    image_url: { url: part.image_url.url },
                  };
                }
                return null;
              })
              .filter(Boolean) as any,
          };
        }
        return { role: msg.role, content: String(msg.content) };
      });

      // System prompt'u başa ekle
      const messagesWithSystem = [
        { role: 'system' as const, content: CHATGPT_SYSTEM_PROMPT },
        ...openAIMessages,
      ];

      if (model.startsWith('gpt-5')) {
        // For GPT-5, use Responses API
        return await this.chatGPT5(messages, model, mode);
      }

      const response = await (this.client as any).chat.completions.create({
        model: model,
        messages: messagesWithSystem,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      return response.choices[0].message.content || '';
    } catch (error: any) {
      this.logger.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model: string = 'gpt-4o',
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      if (model.startsWith('gpt-5')) {
        // ✅ GPT-5.2 - önce "düşünüyor" göster, sonra yanıtı al
        // Bu kullanıcıya anında geri bildirim verir
        this.logger.log(`[OpenAI] Starting GPT-5 request for model: ${model}`);

        const full = await this.chatGPT5(messages, model);
        await this.simulateStreaming(full, onChunk);
        return;
      }

      // Convert internal message format to OpenAI format
      const openAIMessages = messages.map((msg) => {
        if (typeof msg.content === 'string') {
          return { role: msg.role, content: msg.content };
        }
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role,
            content: msg.content
              .map((part) => {
                if (part.type === 'text') {
                  return { type: 'text', text: part.text };
                }
                if (part.type === 'image_url' && part.image_url) {
                  return {
                    type: 'image_url',
                    image_url: { url: part.image_url.url },
                  };
                }
                return null;
              })
              .filter(Boolean) as any,
          };
        }
        return { role: msg.role, content: String(msg.content) };
      });

      // System prompt'u başa ekle
      const messagesWithSystem = [
        { role: 'system' as const, content: CHATGPT_SYSTEM_PROMPT },
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
    } catch (error: any) {
      this.logger.error('OpenAI Stream Error:', error);
      throw new Error(`AI Provider Error: ${error.message}`);
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
  private getReasoningEffort(
    model: string,
  ): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    // Map frontend model IDs to reasoning effort levels
    if (model === 'gpt-5.2-instant') {
      return 'minimal'; // Fastest response
    }
    if (model === 'gpt-5.2-auto' || model === 'gpt-5.2') {
      return 'medium'; // Balanced
    }
    if (model === 'gpt-5.2-thinking') {
      return 'high'; // Deep reasoning
    }
    // GPT-5 Pro doesn't use reasoning effort parameter
    if (model === 'gpt-5.2-pro') {
      return undefined;
    }
    // Default
    if (model === 'gpt-5.2') {
      return 'medium';
    }
    return undefined;
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
  ) {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    // System prompt'u başa ekle
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
      ...messages,
    ];

    // Convert messages to Responses API format
    const inputMessages = messagesWithSystem.map((msg) => {
      // Handle string content
      if (typeof msg.content === 'string') {
        return {
          role: msg.role === 'system' ? 'developer' : msg.role,
          content: msg.content,
        };
      }

      // Handle array content (multimodal)
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role === 'system' ? 'developer' : msg.role,
          content: msg.content
            .map((part) => {
              if (part.type === 'text') {
                return { type: 'input_text', text: part.text };
              }
              if (part.type === 'image_url' && part.image_url) {
                return { type: 'input_image', image_url: part.image_url.url };
              }
              return null;
            })
            .filter(Boolean),
        };
      }

      return {
        role: msg.role === 'system' ? 'developer' : msg.role,
        content: String(msg.content),
      };
    });

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

    // Add image generation tool if mode is 'image'
    if (mode === 'image') {
      requestParams.tools = [
        {
          type: 'image_generation',
          quality: 'auto',
          background: 'auto',
        },
      ];
    }

    // Optionally enable web_search tool when requested via mode and flag
    if (mode === 'web' && process.env.OPENAI_RESPONSES_WEB_TOOL === 'true') {
      requestParams.tools = [
        ...(requestParams.tools || []),
        { type: 'web_search' },
      ];
    }

    // Add previous_response_id for conversation continuity
    if (this.lastResponseId) {
      requestParams.previous_response_id = this.lastResponseId;
    }

    // Multi-turn image editing: include last image_generation_call reference
    // This allows follow-up prompts like "make it more realistic" or "change colors"
    if (mode === 'image' && this.lastImageGenerationCallId) {
      this.logger.log(
        `[GPT-5 Image] Multi-turn: using previous image_generation_call.id: ${this.lastImageGenerationCallId}`,
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

        // Multi-turn image editing: add image_generation_call reference to input
        // This enables follow-up prompts like "make it realistic", "change colors", etc.
        if (mode === 'image' && this.lastImageGenerationCallId) {
          toSend.push({
            type: 'image_generation_call',
            id: this.lastImageGenerationCallId,
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

        // Store response ID for next turn
        this.lastResponseId = response.id;

        // Check for image generation
        const imageGenerationCalls = (response.output || []).filter(
          (o: any) => o.type === 'image_generation_call',
        );

        if (imageGenerationCalls.length > 0 && imageGenerationCalls[0].result) {
          const imageBase64 = imageGenerationCalls[0].result;
          const revisedPrompt = imageGenerationCalls[0].revised_prompt || '';

          // Store image_generation_call.id for multi-turn editing
          // This allows follow-up requests like "make it realistic" or "add more detail"
          if (imageGenerationCalls[0].id) {
            this.lastImageGenerationCallId = imageGenerationCalls[0].id;
            this.logger.log(
              `[GPT-5 Image] Stored image_generation_call.id for multi-turn: ${this.lastImageGenerationCallId}`,
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
      this.lastResponseId = response.id;

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
        content: String(msg.content),
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
   * Clear conversation context (response ID and image generation call ID)
   * Call this when starting a new conversation to ensure clean state
   */
  clearContext(): void {
    this.lastResponseId = null;
    this.lastImageGenerationCallId = null;
    this.logger.log(
      '[OpenAI] Cleared conversation context (responseId & imageGenerationCallId)',
    );
  }

  /**
   * Clear only the image generation context
   * Useful when you want to keep conversation but start fresh image generation
   */
  clearImageContext(): void {
    this.lastImageGenerationCallId = null;
    this.logger.log('[OpenAI] Cleared image generation context');
  }

  /**
   * Get current image generation call ID (for debugging/testing)
   */
  getLastImageGenerationCallId(): string | null {
    return this.lastImageGenerationCallId;
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
}
