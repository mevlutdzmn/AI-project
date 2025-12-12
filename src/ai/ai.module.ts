import { Module } from '@nestjs/common';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { DalleAdapter } from './adapters/dalle.adapter';
import { SearchAdapter } from './adapters/search.adapter';
import { UsersModule } from '../users/users.module';
import { ImageGenerationTool } from './tools/image-generation.tool';
import { WebSearchTool } from './tools/web-search.tool';
import { DeepResearchTool } from './tools/deep-research.tool';
import { CodeInterpreterTool } from './tools/code-interpreter.tool';
import { CanvasTool } from './tools/canvas.tool';

@Module({
  imports: [UsersModule],
  providers: [
    OpenAIAdapter,
    DalleAdapter,
    SearchAdapter,
    ImageGenerationTool,
    WebSearchTool,
    DeepResearchTool,
    CodeInterpreterTool,
    CanvasTool,
  ],
  exports: [
    OpenAIAdapter,
    DalleAdapter,
    SearchAdapter,
    ImageGenerationTool,
    WebSearchTool,
    DeepResearchTool,
    CodeInterpreterTool,
    CanvasTool,
  ],
})
export class AIModule {}
