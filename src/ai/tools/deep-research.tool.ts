import { Injectable } from '@nestjs/common';
import { OpenAIAdapter, ChatMessage } from '../adapters/openai.adapter';
import { SearchAdapter } from '../adapters/search.adapter';

@Injectable()
export class DeepResearchTool {
  constructor(
    private readonly ai: OpenAIAdapter,
    private readonly search: SearchAdapter,
  ) {}

  async run(topic: string) {
    const searchResult = await this.search.search(topic);
    const context = JSON.stringify(searchResult).slice(0, 8000);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful research assistant. Summarize findings with sources.',
      },
      { role: 'user', content: `Topic: ${topic}\nWeb results: ${context}` },
    ];
    const summary = await this.ai.chat(messages, 'gpt-4o', 'web');
    return { summary, sources: searchResult?.results ?? [] };
  }
}
