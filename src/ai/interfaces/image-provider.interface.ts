/**
 * Image Provider Interface
 * 
 * DALL-E 3 deprecated olduğunda (05/12/2026) kolayca GPT-Image'a geçiş için.
 * Bu interface sayesinde farklı image provider'lar aynı şekilde kullanılabilir.
 * 
 * @module ai/interfaces/image-provider
 */

export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';

// Renamed to avoid conflict with ai-adapter.interface.ts
export interface ImageProviderOptions {
  prompt: string;
  size?: ImageSize;
  style?: string;
  quality?: 'standard' | 'hd';
}

// Renamed to avoid conflict with ai-adapter.interface.ts
export interface ImageProviderResult {
  url: string;
  enhancedPrompt: string;
  styleUsed: string;
  model: string;
  debug?: {
    originalPrompt: string;
    detectedLanguage: string;
    baseEnhanced: string;
    finalPromptLength: number;
  };
}

/**
 * Interface for image generation providers
 * Implement this for DALL-E, GPT-Image, Stable Diffusion, etc.
 */
export interface IImageProvider {
  /**
   * Generate image from prompt
   */
  generateImage(options: ImageProviderOptions): Promise<ImageProviderResult>;
  
  /**
   * Check if provider is available
   */
  isAvailable(): boolean;
  
  /**
   * Get provider name
   */
  getProviderName(): string;
}
