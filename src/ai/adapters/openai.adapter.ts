import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { SCHEMAS, type SchemaName } from '../schemas/structured';

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
    private readonly logger = new Logger(OpenAIAdapter.name);

    constructor(private configService: ConfigService) {
        const key = this.configService.get<string>('OPENAI_API_KEY');
        if (!key) {
            this.logger.warn('⚠️  OpenAI API key not found - will use mock responses');
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

            if (model.startsWith('gpt-5')) {
                // For GPT-5, use Responses API
                return await this.chatGPT5(messages, model, mode);
            }

            const response = await (this.client as any).chat.completions.create({
                model: model,
                messages: openAIMessages,
                max_tokens: 4096,
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
                // GPT-5.1 fallback for streaming - simulate word-by-word
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

            // Use any to bypass strict type checking for now as we manually constructed valid messages
            const stream = await (this.client as any).chat.completions.create({
                model: model,
                messages: openAIMessages,
                stream: true,
                max_tokens: 4096,
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
    private async simulateStreaming(
        text: string,
        onChunk: (chunk: string) => void,
    ): Promise<void> {
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i < words.length - 1 ? ' ' : '');
            onChunk(word);
            // Small delay for smooth effect (50ms per word)
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    // ------------------------------
    // GPT-5.1 — RESPONSES API
    // ------------------------------
    private getReasoningEffort(
        model: string,
    ): 'minimal' | 'low' | 'medium' | 'high' | undefined {
        // Map frontend model IDs to reasoning effort levels
        if (model === 'gpt-5.1-instant') {
            return 'minimal'; // Fastest response
        }
        if (model === 'gpt-5.1-auto' || model === 'gpt-5.1') {
            return 'medium'; // Balanced
        }
        if (model === 'gpt-5.1-thinking') {
            return 'high'; // Deep reasoning
        }
        // GPT-5 Pro doesn't use reasoning effort parameter
        if (model === 'gpt-5-pro') {
            return undefined;
        }
        // Default for base gpt-5
        if (model === 'gpt-5') {
            return 'medium';
        }
        return undefined;
    }

    private getBaseModel(model: string): string {
        // Map frontend model IDs to actual OpenAI model names
        if (model.startsWith('gpt-5.1')) {
            return 'gpt-5';
        }
        if (model === 'gpt-5-pro') {
            return 'gpt-5-pro';
        }
        if (model === 'gpt-5') {
            return 'gpt-5';
        }
        return model;
    }

    private async chatGPT5(
        messages: ChatMessage[],
        model: string = 'gpt-5.1',
        mode?: string,
    ) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        // Convert messages to Responses API format
        const inputMessages = messages.map((msg) => {
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

        const requestParams: any = {
            model: baseModel,
            input: inputMessages,
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
            // Let the model auto-select tools; do not force tool_choice to keep compatibility
        }

        // Add previous_response_id for conversation continuity
        if (this.lastResponseId) {
            requestParams.previous_response_id = this.lastResponseId;
        }

        const response = await (this.client as any).responses.create(requestParams);

        // Store response ID for next turn
        this.lastResponseId = response.id;

        // Check if response contains image generation
        const imageGenerationCalls = response.output.filter(
            (o: any) => o.type === 'image_generation_call',
        );

        if (imageGenerationCalls.length > 0 && imageGenerationCalls[0].result) {
            // Return image as base64 markdown
            const imageBase64 = imageGenerationCalls[0].result;
            const revisedPrompt = imageGenerationCalls[0].revised_prompt || '';

            this.logger.log(
                `[GPT-5 Image] Generated image with revised prompt: ${revisedPrompt}`,
            );

            // Return markdown image with base64 data
            return `![Generated Image](data:image/png;base64,${imageBase64})`;
        }

        return response.output_text || 'No response';
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
                o.type === 'message' && o.content?.some((c: any) => c.type === 'refusal'),
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
}
