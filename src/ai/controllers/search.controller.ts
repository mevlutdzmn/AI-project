import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SearchAdapter } from '../adapters/search.adapter';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class SearchController {
  constructor(private searchAdapter: SearchAdapter) {}

  @Post('search')
  @UseGuards(AuthGuard('jwt'))
  async search(@Body() body: { query: string }) {
    const result = await this.searchAdapter.search(body.query, 6);
    return result;
  }
}
