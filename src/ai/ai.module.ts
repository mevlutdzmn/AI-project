/**
 * AI Module
 * 
 * Provides AI adapters following Dependency Inversion Principle:
 * - Uses injection tokens for abstraction
 * - Concrete implementations can be swapped easily
 * - Enables better testability
 * 
 * @module ai
 */

import { Module } from '@nestjs/common';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { DalleAdapter } from './adapters/dalle.adapter';
import { SearchAdapter } from './adapters/search.adapter';
import { DeepResearchAdapter } from './adapters/deep-research.adapter';
import { UsersModule } from '../users/users.module';
import { ImageGenerationTool } from './tools/image-generation.tool';
import { WebSearchTool } from './tools/web-search.tool';
import { DeepResearchTool } from './tools/deep-research.tool';
import { CodeInterpreterTool } from './tools/code-interpreter.tool';
import { CanvasTool } from './tools/canvas.tool';
import { AI_TOKENS } from './interfaces';

@Module({
  imports: [UsersModule],
  providers: [
    // Concrete implementations
    OpenAIAdapter,
    DalleAdapter,
    SearchAdapter,
    DeepResearchAdapter,
    
    // Dependency Inversion: Token-based providers
    // Allows swapping implementations without changing consumers
    {
      provide: AI_TOKENS.CHAT_ADAPTER,
      useExisting: OpenAIAdapter,
    },
    {
      provide: AI_TOKENS.IMAGE_ADAPTER,
      useExisting: DalleAdapter,
    },
    {
      provide: AI_TOKENS.SEARCH_ADAPTER,
      useExisting: SearchAdapter,
    },
    {
      provide: AI_TOKENS.RESEARCH_ADAPTER,
      useExisting: DeepResearchAdapter,
    },
    
    // Tools
    ImageGenerationTool,
    WebSearchTool,
    DeepResearchTool,
    CodeInterpreterTool,
    CanvasTool,
  ],
  exports: [
    // Export both concrete and abstract tokens
    OpenAIAdapter,
    DalleAdapter,
    SearchAdapter,
    DeepResearchAdapter,
    
    // Token exports for DIP
    AI_TOKENS.CHAT_ADAPTER,
    AI_TOKENS.IMAGE_ADAPTER,
    AI_TOKENS.SEARCH_ADAPTER,
    AI_TOKENS.RESEARCH_ADAPTER,
    
    // Tools
    ImageGenerationTool,
    WebSearchTool,
    DeepResearchTool,
    CodeInterpreterTool,
    CanvasTool,
  ],
})
export class AIModule {}
