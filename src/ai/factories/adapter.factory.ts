/**
 * AI Adapter Factory
 *
 * Routes requests to the appropriate AI adapter based on model name.
 * Supports feature flags for gradual rollout.
 *
 * Pattern: Factory + Strategy
 * - OpenAI models → OpenAIAdapter
 * - Gemini models → GeminiAdapter
 *
 * @module ai/factories/adapter
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIAdapter } from '../adapters/openai.adapter';
import { GeminiAdapter, GEMINI_MODELS } from '../adapters/gemini.adapter';

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * Factory for creating/selecting AI adapters based on model
 */
@Injectable()
export class AdapterFactory {
  private readonly logger = new Logger(AdapterFactory.name);
  private readonly geminiEnabled: boolean;

  constructor(
    private readonly openaiAdapter: OpenAIAdapter,
    private readonly geminiAdapter: GeminiAdapter,
    private readonly configService: ConfigService,
  ) {
    // Feature flag for Gemini
    this.geminiEnabled =
      this.configService.get<string>('GEMINI_ENABLED') === 'true';

    if (this.geminiEnabled && this.geminiAdapter.isAvailable()) {
      this.logger.log('✅ Gemini adapter enabled and available');
    } else if (this.geminiEnabled) {
      this.logger.warn('⚠️ Gemini enabled but API key missing - falling back to OpenAI');
    }
  }

  // ============================================
  // Provider Detection
  // ============================================

  /**
   * Determine which provider to use based on model name
   */
  getProvider(model: string): AIProvider {
    if (!this.geminiEnabled) {
      return 'openai';
    }

    if (this.isGeminiModel(model)) {
      // Check if Gemini is actually available
      if (this.geminiAdapter.isAvailable()) {
        return 'gemini';
      }
      this.logger.warn(
        `[AdapterFactory] Model ${model} is Gemini but adapter not available, falling back to OpenAI`,
      );
    }

    return 'openai';
  }

  /**
   * Check if model is a Gemini model
   */
  isGeminiModel(model: string): boolean {
    return (
      model.startsWith('gemini') ||
      model.startsWith('imagen') ||
      model.startsWith('veo') ||
      model.startsWith('models/lyria')
    );
  }

  // ============================================
  // Adapter Getters
  // ============================================

  /**
   * Get the appropriate adapter for a given model
   */
  getAdapter(model: string): OpenAIAdapter | GeminiAdapter {
    const provider = this.getProvider(model);

    if (provider === 'gemini') {
      return this.geminiAdapter;
    }

    return this.openaiAdapter;
  }

  /**
   * Get OpenAI adapter directly
   */
  getOpenAIAdapter(): OpenAIAdapter {
    return this.openaiAdapter;
  }

  /**
   * Get Gemini adapter directly
   */
  getGeminiAdapter(): GeminiAdapter {
    return this.geminiAdapter;
  }

  // ============================================
  // Chat Methods (Delegating to appropriate adapter)
  // ============================================

  /**
   * Non-streaming chat - routes to appropriate provider
   */
  async chat(
    messages: any[],
    model: string,
    systemPrompt?: string,
    sessionId?: string,
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const provider = this.getProvider(model);
    this.logger.debug(`[AdapterFactory] chat() using ${provider} for model ${model}`);

    if (provider === 'gemini') {
      return this.geminiAdapter.chat(messages, model, systemPrompt, sessionId);
    }

    return this.openaiAdapter.chat(messages, model, systemPrompt, sessionId);
  }

  /**
   * Streaming chat - routes to appropriate provider
   */
  async streamChat(
    messages: any[],
    onChunk: (chunk: string) => void,
    model: string,
    sessionId?: string,
  ): Promise<void> {
    const provider = this.getProvider(model);
    this.logger.debug(`[AdapterFactory] streamChat() using ${provider} for model ${model}`);

    if (provider === 'gemini') {
      return this.geminiAdapter.streamChat(messages, onChunk, model, sessionId);
    }

    return this.openaiAdapter.streamChat(messages, onChunk, model, sessionId);
  }

  /**
   * Chat with function calling - routes to appropriate provider
   */
  async chatWithFunctionCalling(
    messages: any[],
    model: string,
    hasRecentImage: boolean = false,
    sessionId?: string,
  ): Promise<any> {
    const provider = this.getProvider(model);
    this.logger.debug(
      `[AdapterFactory] chatWithFunctionCalling() using ${provider} for model ${model}`,
    );

    if (provider === 'gemini') {
      return this.geminiAdapter.chatWithFunctionCalling(
        messages,
        model,
        hasRecentImage,
        sessionId,
      );
    }

    return this.openaiAdapter.chatWithFunctionCalling(
      messages,
      model,
      hasRecentImage,
      sessionId,
    );
  }

  // ============================================
  // Status & Info
  // ============================================

  /**
   * Get status of all adapters
   */
  getStatus(): {
    openai: boolean;
    gemini: boolean;
    geminiEnabled: boolean;
  } {
    return {
      openai: true, // OpenAI adapter handles missing key with mock
      gemini: this.geminiAdapter.isAvailable(),
      geminiEnabled: this.geminiEnabled,
    };
  }

  /**
   * Get all available models from all providers
   */
  getAvailableModels(): {
    openai: string[];
    gemini: string[];
  } {
    return {
      openai: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-5.2-auto',
        'o1',
        'o1-mini',
      ],
      gemini: this.geminiEnabled ? this.geminiAdapter.getSupportedModels() : [],
    };
  }
}
