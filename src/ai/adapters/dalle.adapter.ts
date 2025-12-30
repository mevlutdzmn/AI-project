import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { STYLE_PRESETS, StyleKey, detectStyleFromPrompt, getStylePreset } from '../constants/style-presets';
import { IImageProvider, ImageProviderOptions, ImageProviderResult, ImageSize } from '../interfaces/image-provider.interface';

/**
 * DALL-E 3 Adapter with Full Prompt Pipeline
 * 
 * ⚠️ NOTE: DALL-E 3 deprecated - support ends 05/12/2026
 * Bu adapter IImageProvider interface'ini implement ediyor
 * Gelecekte GPT-Image modeline geçiş için hazır
 * 
 * Features:
 * - LLM-based prompt enhancement (ChatGPT-style)
 * - Auto style detection
 * - Multi-language support (TR, FA, EN)
 * - Quality: HD by default
 */
@Injectable()
export class DalleAdapter implements IImageProvider {
  private client: OpenAI | null;
  private readonly logger = new Logger(DalleAdapter.name);
  
  // Prompt max uzunluk (700-1200 arası optimal)
  private readonly MAX_PROMPT_LENGTH = 1000;
  
  // Temizlenmesi gereken kelimeler (LLM bazen bunları ekliyor)
  private readonly FORBIDDEN_TERMS = /\b(watermark|logo|text overlay|signature|copyright|no\s+\w+|without\s+\w+|avoid\s+\w+)\b/gi;

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

  // === IImageProvider Interface Implementation ===
  
  isAvailable(): boolean {
    return this.client !== null;
  }
  
  getProviderName(): string {
    return 'dall-e-3';
  }

  /**
   * IImageProvider interface method
   */
  async generateImage(options: ImageProviderOptions): Promise<ImageProviderResult> {
    return this.generateImageFull(
      options.prompt,
      options.size || '1024x1024',
      options.style as StyleKey | undefined
    );
  }

  // === Internal Helper Methods ===

  /**
   * Quick language detection
   */
  private detectLanguage(text: string): 'tr' | 'fa' | 'en' | 'other' {
    // Turkish
    const trChars = /[çğıöşüÇĞİÖŞÜ]/;
    const trWords = /\b(ve|ile|bir|olan|olsun|üstünde|gibi|yap|çiz|resmi|kedi|köpek|at|kuş|insan|adam|kadın)\b/i;
    if (trChars.test(text) || trWords.test(text)) return 'tr';
    
    // Persian/Farsi
    const faChars = /[\u0600-\u06FF]/;
    if (faChars.test(text)) return 'fa';
    
    // English
    const enWords = /\b(the|a|an|with|on|in|of|draw|create|make|image|cat|dog|horse)\b/i;
    if (enWords.test(text)) return 'en';
    
    return 'other';
  }

  /**
   * Clean and validate prompt
   */
  private cleanPrompt(prompt: string): string {
    return prompt
      .replace(/\s+/g, ' ')                    // Multiple spaces → single
      .replace(/[""]/g, '"')                   // Curly quotes → straight
      .replace(/['']/g, "'")                   // Curly apostrophes → straight
      .replace(this.FORBIDDEN_TERMS, '')       // Remove forbidden terms
      .replace(/\s+/g, ' ')                    // Clean up after removal
      .trim()
      .slice(0, this.MAX_PROMPT_LENGTH);       // Truncate if too long
  }

  /**
   * Full prompt enhancement pipeline via LLM
   */
  private async enhancePromptWithLLM(
    userPrompt: string,
    style?: StyleKey
  ): Promise<{ enhancedPrompt: string; styleUsed: StyleKey; debug: any }> {
    
    const detectedLang = this.detectLanguage(userPrompt);
    const { key: styleKey, preset } = getStylePreset(style || detectStyleFromPrompt(userPrompt));

    if (!this.client) {
      // Fallback without LLM
      const fallbackPrompt = this.cleanPrompt(`${preset.prefix} ${userPrompt}, ${preset.suffix}`);
      return {
        enhancedPrompt: fallbackPrompt,
        styleUsed: styleKey,
        debug: { error: 'No OpenAI client', fallback: true }
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert prompt engineer for DALL-E 3 image generation.

TASK: Transform the user's prompt into a detailed image generation prompt.

=== CRITICAL TRANSLATION RULES ===
Turkish:
- "at" = "horse" (animal), NEVER "throw"
- "kedi" = "cat", "köpek" = "dog", "kuş" = "bird"
- "insan/adam" = "man/person", "kadın" = "woman"
- "resmi yap/çiz" = "create an image of"
- "binsin/binen" = "riding on", "koşsun" = "running"
- "uçsun" = "flying", "otursun" = "sitting"
- "üstünde" = "on top of"

Persian/Farsi: Translate accurately to English.

=== ENHANCEMENT RULES ===
1. KEEP the EXACT subject (cat=cat, horse=horse, NO substitutions!)
2. Add: colors, textures, expressions, environment, lighting, composition
3. Maximum 40 words (shorter is better)
4. Output ONLY the prompt, no explanations
5. NEVER include: brand names, celebrity names, copyrighted characters
6. NEVER write: "no watermark", "without text", "avoid X" - just describe what IS there

=== STYLE: ${preset.name} ===
Avoid these aesthetics: ${preset.avoidHints}

=== EXAMPLES ===
"kedi" → A fluffy orange tabby cat with bright green eyes sitting on a sunny windowsill, soft natural lighting, detailed fur

"at üstünde adam" → A man riding a majestic brown horse through an open meadow at golden hour, dramatic side lighting, windswept mane`
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 150, // Shorter = more focused
        temperature: 0.3,
      });

      let baseEnhanced = response.choices[0]?.message?.content?.trim() || userPrompt;
      
      // Clean LLM output
      baseEnhanced = baseEnhanced
        .replace(/^["']|["']$/g, '')
        .replace(/^(Enhanced prompt:|Output:|Here is|The enhanced prompt:)/i, '')
        .trim();

      // Construct final prompt: prefix + enhanced + suffix
      const finalPrompt = this.cleanPrompt(
        `${preset.prefix} ${baseEnhanced}, ${preset.suffix}`
      );

      this.logger.log(`[Prompt Pipeline] Original: "${userPrompt}"`);
      this.logger.log(`[Prompt Pipeline] Language: ${detectedLang}, Style: ${styleKey}`);
      this.logger.log(`[Prompt Pipeline] Final (${finalPrompt.length} chars): "${finalPrompt}"`);

      return {
        enhancedPrompt: finalPrompt,
        styleUsed: styleKey,
        debug: {
          originalPrompt: userPrompt,
          detectedLanguage: detectedLang,
          baseEnhanced,
          finalPromptLength: finalPrompt.length
        }
      };

    } catch (error: unknown) {
      this.logger.warn(`LLM enhancement failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      
      // Fallback: apply style without LLM enhancement
      const fallbackPrompt = this.cleanPrompt(`${preset.prefix} ${userPrompt}, ${preset.suffix}`);
      return {
        enhancedPrompt: fallbackPrompt,
        styleUsed: styleKey,
        debug: { 
          originalPrompt: userPrompt,
          error: 'LLM enhancement failed', 
          fallback: true 
        }
      };
    }
  }

  // === Public Methods ===

  /**
   * Generate image - backward compatible (returns just URL)
   * @deprecated Use generateImageFull for enhanced response
   */
  async generateImageLegacy(
    prompt: string,
    size: ImageSize = '1024x1024',
    style?: StyleKey
  ): Promise<string> {
    const result = await this.generateImageFull(prompt, size, style);
    return result.url;
  }

  /**
   * Generate image with full response including enhanced prompt and debug info
   */
  async generateImageFull(
    prompt: string,
    size: ImageSize = '1024x1024',
    style?: StyleKey
  ): Promise<ImageProviderResult> {
    if (!this.client) {
      throw new Error('DALL-E client not initialized - check OPENAI_API_KEY');
    }

    try {
      // 1. Run enhancement pipeline
      const { enhancedPrompt, styleUsed, debug } = await this.enhancePromptWithLLM(prompt, style);
      
      // 2. Get DALL-E style (vivid/natural)
      const dalleStyle = STYLE_PRESETS[styleUsed].dalleStyle;

      this.logger.log(`[DALL-E] Generating: style=${dalleStyle}, quality=hd, size=${size}`);

      // 3. Generate image with DALL-E 3
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: size,
        quality: 'hd',                  // HD kalite (standard değil!)
        style: dalleStyle,              // vivid/natural style'a göre
        response_format: 'url',         // Explicit format
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in DALL-E response');
      }

      this.logger.log(`✅ Image generated [style: ${styleUsed}, dalle: ${dalleStyle}]`);

      return {
        url: imageUrl,
        enhancedPrompt,
        styleUsed,
        model: 'dall-e-3',
        debug
      };

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`DALL-E failed: ${message}`);
      
      // User-friendly error messages
      if (message.includes('content_policy')) {
        throw new Error('İçerik politikası ihlali - lütfen farklı bir prompt deneyin');
      }
      if (message.includes('rate_limit')) {
        throw new Error('Çok fazla istek - lütfen biraz bekleyin');
      }
      
      throw new Error(`Görsel oluşturma hatası: ${message}`);
    }
  }
}
