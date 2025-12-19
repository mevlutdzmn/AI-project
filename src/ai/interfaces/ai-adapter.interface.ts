/**
 * AI Adapter Interface
 * 
 * Dependency Inversion Principle (DIP):
 * High-level modules (ChatService) depend on abstractions (IAIAdapter)
 * rather than concrete implementations (OpenAIAdapter).
 * 
 * This allows:
 * - Easy swapping of AI providers (OpenAI → Claude → Gemini)
 * - Better testability with mock implementations
 * - Loose coupling between services
 * 
 * @module ai/interfaces
 */

import { ChatMessage } from '../adapters/openai.adapter';

/**
 * Base interface for all AI chat adapters
 */
export interface IAIAdapter {
  /**
   * Send a chat message and get a response
   */
  chat(
    messages: ChatMessage[],
    model?: string,
    options?: ChatOptions,
  ): Promise<ChatResponse>;

  /**
   * Send a chat message with streaming response
   */
  chatStream(
    messages: ChatMessage[],
    model?: string,
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown>;
}

/**
 * Interface for image generation adapters
 */
export interface IImageAdapter {
  /**
   * Generate an image from a prompt
   */
  generate(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  /**
   * Edit an existing image
   */
  edit?(
    imageUrl: string,
    prompt: string,
    options?: ImageEditOptions,
  ): Promise<ImageGenerationResult>;
}

/**
 * Interface for search adapters
 */
export interface ISearchAdapter {
  /**
   * Perform a web search
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Interface for research adapters
 */
export interface IResearchAdapter {
  /**
   * Perform deep research on a topic
   */
  research(
    topic: string,
    options?: ResearchOptions,
  ): AsyncGenerator<ResearchChunk, ResearchResult, unknown>;
}

// ============================================
// Type Definitions
// ============================================

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  structuredOutput?: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface ImageGenerationOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}

export interface ImageEditOptions extends ImageGenerationOptions {
  mask?: string;
}

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
}

export interface SearchOptions {
  maxResults?: number;
  language?: string;
  region?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchOptions {
  depth?: 'basic' | 'detailed' | 'comprehensive';
  maxSources?: number;
}

export interface ResearchChunk {
  type: 'progress' | 'source' | 'content';
  data: string;
}

export interface ResearchResult {
  summary: string;
  sources: SearchResult[];
  content: string;
}

// ============================================
// Injection Tokens
// ============================================

/**
 * Injection tokens for dependency inversion
 * Usage: @Inject(AI_TOKENS.CHAT_ADAPTER) private chatAdapter: IAIAdapter
 */
export const AI_TOKENS = {
  CHAT_ADAPTER: 'AI_CHAT_ADAPTER',
  IMAGE_ADAPTER: 'AI_IMAGE_ADAPTER',
  SEARCH_ADAPTER: 'AI_SEARCH_ADAPTER',
  RESEARCH_ADAPTER: 'AI_RESEARCH_ADAPTER',
} as const;
