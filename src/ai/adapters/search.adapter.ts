import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SearchAdapter {
    private bingKey: string | undefined;
    private readonly logger = new Logger(SearchAdapter.name);

    constructor(private configService: ConfigService) {
        this.bingKey = this.configService.get<string>('BING_API_KEY');
        if (!this.bingKey) {
            this.logger.warn(
                'BING_API_KEY not set - web search will return guidance instead of live results.',
            );
        }
    }

    async search(query: string, top: number = 5): Promise<any> {
        if (!this.bingKey) {
            return {
                type: 'fallback',
                message:
                    'Search provider not configured. Set BING_API_KEY in the backend .env to enable live web search (Bing Web Search API).',
            };
        }

        try {
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

            return {
                type: 'results',
                query,
                results,
            };
        } catch (error: any) {
            this.logger.error('SearchAdapter error:', error?.message || error);
            return {
                type: 'error',
                message: error?.message || 'Search failed',
            };
        }
    }
}
