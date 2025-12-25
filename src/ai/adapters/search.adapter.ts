import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SearchAdapter {
  private bingKey: string | undefined;
  private serperKey: string | undefined;
  private readonly logger = new Logger(SearchAdapter.name);

  constructor(private configService: ConfigService) {
    this.bingKey = this.configService.get<string>('BING_API_KEY');
    this.serperKey = this.configService.get<string>('SERPER_API_KEY');

    if (!this.bingKey && !this.serperKey) {
      this.logger.warn(
        'No search API key set - web search will return guidance instead of live results. Set SERPER_API_KEY or BING_API_KEY in .env',
      );
    } else if (this.serperKey) {
      this.logger.log('Using Serper.dev for web search');
    } else if (this.bingKey) {
      this.logger.log('Using Bing API for web search');
    }
  }

  async search(query: string, top: number = 5): Promise<any> {
    // Prefer Serper over Bing (free tier available)
    if (this.serperKey) {
      return this.searchWithSerper(query, top);
    }

    if (this.bingKey) {
      return this.searchWithBing(query, top);
    }

    return {
      type: 'fallback',
      message:
        'Search provider not configured. Set SERPER_API_KEY or BING_API_KEY in the backend .env to enable live web search.',
    };
  }

  private async searchWithSerper(query: string, top: number): Promise<any> {
    try {
      this.logger.log(`[Serper] Searching for: ${query}`);

      const res = await axios.post(
        'https://google.serper.dev/search',
        {
          q: query,
          num: top,
        },
        {
          headers: {
            'X-API-KEY': this.serperKey,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );

      const organic = res.data.organic || [];
      const results = organic.map((r: any) => ({
        name: r.title,
        url: r.link,
        snippet: r.snippet,
      }));

      this.logger.log(`[Serper] Found ${results.length} results`);

      return {
        type: 'results',
        query,
        results,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Serper search failed';
      this.logger.error('[Serper] Search error:', message);
      return {
        type: 'error',
        message,
      };
    }
  }

  private async searchWithBing(query: string, top: number): Promise<any> {
    try {
      this.logger.log(`[Bing] Searching for: ${query}`);

      const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(
        query,
      )}&count=${top}`;
      const res = await axios.get(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.bingKey,
        },
        timeout: 10_000,
      });

      const webPages = res.data.webPages?.value || [];
      const results = webPages.map((r: any) => ({
        name: r.name,
        url: r.url,
        snippet: r.snippet,
      }));

      this.logger.log(`[Bing] Found ${results.length} results`);

      return {
        type: 'results',
        query,
        results,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bing search failed';
      this.logger.error('[Bing] Search error:', message);
      return {
        type: 'error',
        message,
      };
    }
  }
}
