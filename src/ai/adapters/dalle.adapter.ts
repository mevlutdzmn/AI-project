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
            content: `You are an expert prompt engineer for DALL-E image generation.
Your job: Translate the user's prompt to English AND choose the BEST visual style for the subject.

TRANSLATION RULES:
1. Turkish "at" = "horse" (animal), NOT "throw"
2. Turkish "resmi yap" = "create an image of"
3. Keep the subject exactly as requested

STYLE SELECTION - Choose the most appropriate style:
- Real animals, people, cars, nature, food → "photorealistic, highly detailed, 8K quality"
- Mythical creatures (şahmeran, dragon, unicorn) → "epic fantasy art, dramatic lighting, detailed illustration"
- Anime/manga characters → "anime style, high quality anime art"
- Cartoons, fun characters → "Pixar style 3D render" or "cartoon illustration"
- Logos, icons → "minimalist vector logo design, clean lines"
- Landscapes, scenery → "photorealistic landscape photography, golden hour lighting"
- Portraits → "professional portrait photography, studio lighting"
- Abstract concepts → "abstract digital art, vibrant colors"
- Historical figures/scenes → "classical oil painting style, museum quality"
- Sci-fi concepts → "sci-fi concept art, futuristic, cinematic"

OUTPUT: Only the enhanced English prompt with appropriate style. Nothing else.

Examples:
- "at resmi yap" -> "photorealistic, highly detailed image of a majestic horse, 8K quality"
- "şahmeran resmi" -> "epic fantasy art of Shahmaran, the mythical half-woman half-snake queen, dramatic lighting, intricate scales and jewelry"
- "kedi çiz" -> "cute cartoon illustration of a cat, Pixar style"
- "anime kız" -> "beautiful anime girl, high quality anime art, detailed"
- "dağ manzarası" -> "photorealistic mountain landscape, golden hour lighting, breathtaking view"
- "logo tasarla" -> "minimalist modern logo design, clean vector lines"`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const translated = response.choices[0]?.message?.content?.trim();
      if (translated) {
        this.logger.log(
          `[DallEAdapter] Translated prompt: "${prompt}" -> "${translated}"`,
        );
        return translated;
      }
      return prompt;
    } catch (error: unknown) {
      this.logger.warn(
        `Translation failed, using original prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
    } catch (error: unknown) {
      this.logger.error('DALL-E Error:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Image Generation Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
