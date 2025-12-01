import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class DalleAdapter {
    private client: OpenAI | null;
    private readonly logger = new Logger(DalleAdapter.name);

    constructor(private configService: ConfigService) {
        const key = this.configService.get<string>('OPENAI_API_KEY');
        if (!key) {
            this.logger.warn('⚠️  OpenAI API key not found - DALL-E unavailable');
            this.client = null;
        } else {
            this.client = new OpenAI({ apiKey: key });
            this.logger.log('✅ DALL-E client initialized');
        }
    }

    async generateImage(
        prompt: string,
        size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
    ): Promise<string> {
        try {
            if (!this.client) {
                throw new Error('DALL-E client not initialized');
            }

            this.logger.log(`[DallEAdapter] Generating image: "${prompt}"`);

            const response = await this.client.images.generate({
                model: 'dall-e-3',
                prompt: prompt,
                n: 1,
                size: size,
                quality: 'standard',
            });

            const imageUrl = response.data?.[0]?.url;
            if (!imageUrl) {
                throw new Error('No image URL returned');
            }

            this.logger.log(`✅ Image generated successfully`);
            return imageUrl;
        } catch (error: any) {
            this.logger.error('DALL-E Error:', error.message);
            throw new Error(`Image Generation Error: ${error.message}`);
        }
    }
}
