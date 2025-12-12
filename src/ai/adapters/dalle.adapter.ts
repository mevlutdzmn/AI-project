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

    /**
     * Translate prompt to English to avoid content moderation issues
     * with non-English languages (Persian, Turkish, etc.)
     */
    private async translateToEnglish(prompt: string): Promise<string> {
        if (!this.client) {
            return prompt;
        }

        try {
            const response = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a translator. Translate the following image generation prompt to English. Keep it concise and suitable for DALL-E. Only output the translated prompt, nothing else.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: 500,
                temperature: 0.3,
            });

            const translated = response.choices[0]?.message?.content?.trim();
            if (translated) {
                this.logger.log(`[DallEAdapter] Translated prompt: "${prompt}" -> "${translated}"`);
                return translated;
            }
            return prompt;
        } catch (error: any) {
            this.logger.warn(`Translation failed, using original prompt: ${error.message}`);
            return prompt;
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

            this.logger.log(`[DallEAdapter] Original prompt: "${prompt}"`);

            // Translate to English to avoid content moderation false positives
            const englishPrompt = await this.translateToEnglish(prompt);

            const response = await this.client.images.generate({
                model: 'dall-e-3',
                prompt: englishPrompt,
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
