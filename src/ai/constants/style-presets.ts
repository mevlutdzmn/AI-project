/**
 * Style Presets for Image Generation
 * 
 * Used by DALL-E adapter (and future GPT-Image adapter)
 * to apply consistent visual styles to generated images.
 * 
 * @module ai/constants/style-presets
 */

export type StyleKey = 'photoreal' | 'cinematic' | 'artistic' | 'anime' | 'cartoon' | 'logo' | 'fantasy';

export interface StylePreset {
  name: string;
  prefix: string;
  suffix: string;
  avoidHints: string; // LLM'e "kaçınma talimatı" - garantili değil ama yardımcı
  dalleStyle: 'vivid' | 'natural'; // DALL-E 3 sadece bu ikisini destekliyor
}

export const STYLE_PRESETS: Record<StyleKey, StylePreset> = {
  photoreal: {
    name: 'Photorealistic',
    prefix: 'Photorealistic photograph,',
    suffix: 'natural lighting, shallow depth of field, sharp focus, intricate details, ultra realistic, 8K UHD, professional photography',
    avoidHints: 'cartoon, illustration, anime, painting, lowres, blurry, artifacts, distorted',
    dalleStyle: 'natural' // Gerçekçi için natural
  },
  cinematic: {
    name: 'Cinematic',
    prefix: 'Cinematic film still, dramatic movie scene,',
    suffix: 'dramatic lighting, film grain, high contrast, anamorphic lens, depth of field, color graded, 4K cinema quality',
    avoidHints: 'cartoon, illustration, flat lighting, lowres, blurry',
    dalleStyle: 'vivid' // Cinematic için vivid daha iyi
  },
  artistic: {
    name: 'Digital Art',
    prefix: 'Digital art, trending on artstation,',
    suffix: 'vibrant colors, detailed, professional digital illustration, concept art, highly detailed, masterpiece',
    avoidHints: 'lowres, blurry, artifacts, amateur, bad composition',
    dalleStyle: 'vivid'
  },
  anime: {
    name: 'Anime',
    prefix: 'High quality anime artwork, anime style illustration,',
    suffix: 'detailed, vibrant colors, clean lines, professional anime illustration, studio quality animation art',
    avoidHints: 'lowres, blurry, bad anatomy, western cartoon, 3D render, photo, realistic',
    dalleStyle: 'vivid'
  },
  cartoon: {
    name: 'Cartoon / 3D Animation',
    // ⚠️ Marka isimleri yok (Pixar/Disney değil)
    prefix: 'High quality 3D animated character, modern animation studio quality,',
    suffix: 'soft studio lighting, vibrant colors, appealing character design, smooth 3D render, family friendly animation style',
    avoidHints: 'lowres, blurry, scary, dark, horror, realistic photo, uncanny valley',
    dalleStyle: 'vivid'
  },
  logo: {
    name: 'Logo Design',
    prefix: 'Minimalist modern logo design, professional vector style,',
    suffix: 'clean lines, simple geometric shapes, professional branding, scalable design, clean white background',
    avoidHints: 'photo, realistic, complex details, cluttered, 3D shadows, many colors, gradients',
    dalleStyle: 'natural'
  },
  fantasy: {
    name: 'Epic Fantasy',
    prefix: 'Epic fantasy art, dramatic mythical scene,',
    suffix: 'dramatic magical lighting, intricate details, majestic atmosphere, concept art quality, highly detailed fantasy illustration',
    avoidHints: 'lowres, blurry, modern elements, photo, childish cartoon',
    dalleStyle: 'vivid'
  }
};

/**
 * Auto-detect best style from user prompt
 */
export function detectStyleFromPrompt(prompt: string): StyleKey {
  const lower = prompt.toLowerCase();
  
  // Anime/manga detection
  if (/anime|manga|waifu|kawaii|chibi|アニメ/.test(lower)) return 'anime';
  
  // Logo/icon detection
  if (/logo|icon|brand|emblem|simge|amblem|لوگو/.test(lower)) return 'logo';
  
  // Cartoon/3D detection - marka ismi olmadan
  if (/cartoon|3d|animated|çizgi.?film|karikatür|animasyon|cute|sevimli|کارتون/.test(lower)) return 'cartoon';
  
  // Fantasy detection
  if (/fantasy|dragon|ejderha|wizard|büyücü|mythical|şahmeran|unicorn|elf|sihir|magic|اژدها/.test(lower)) return 'fantasy';
  
  // Cinematic detection
  if (/cinematic|film|movie|sahne|dramatic|sinematik|سینمایی/.test(lower)) return 'cinematic';
  
  // Artistic/illustration detection
  if (/art\b|sanat|painting|tablo|illustration|çizim|digital.?art|نقاشی/.test(lower)) return 'artistic';
  
  // Default: photorealistic (animals, people, objects, nature)
  return 'photoreal';
}

/**
 * Get style by key with fallback
 */
export function getStylePreset(key?: string): { key: StyleKey; preset: StylePreset } {
  const validKey = (key && key in STYLE_PRESETS ? key : 'photoreal') as StyleKey;
  return { key: validKey, preset: STYLE_PRESETS[validKey] };
}
