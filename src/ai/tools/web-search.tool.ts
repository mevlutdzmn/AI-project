import { Injectable } from '@nestjs/common';
import { SearchAdapter } from '../adapters/search.adapter';

@Injectable()
export class WebSearchTool {
  constructor(private readonly search: SearchAdapter) {}

  async run(query: string) {
    return this.search.search(query);
  }
}
