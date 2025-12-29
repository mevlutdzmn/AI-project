/**
 * Image Edit Keywords
 * 
 * Multi-language keywords for detecting image editing/modification requests.
 * These keywords are used for multi-turn image editing follow-ups.
 * Supports Turkish, Persian (Farsi), and English.
 * 
 * @module chat/constants/image-edit-keywords
 * @description Single Responsibility: Only contains image edit detection keywords
 */

// ==================== TÜRKÇE ====================
const TURKISH_EDIT_KEYWORDS = [
  'daha realistik',
  'daha gerçekçi',
  'gerçekçi olsun',
  'realistik olsun',
  'gerçekçi yap',
  'realistik yap',
  'gerçek gibi',
  'gerçek olsun',
  'gerçek yap',
  'daha gerçek',
  'gerçekmiş gibi',
  'fotoğraf gibi',
  'foto gibi',
  'doğal görünsün',
  'doğal olsun',
  'daha doğal',
  'daha detaylı',
  'detaylı yap',
  'detaylı olsun',
  'daha canlı',
  'renkleri değiştir',
  'rengi değiştir',
  'rengini değiştir',
  'arka planı değiştir',
  'arka plan değiştir',
  'arkaplanı değiştir',
  'daha parlak',
  'daha karanlık',
  'daha büyük',
  'daha küçük',
  'yakınlaştır',
  'uzaklaştır',
  'ekle',
  'çıkar',
  'kaldır',
  'değiştir',
  'düzenle',
  'düzelt',
  'iyileştir',
  'güzelleştir',
  'aynısını',
  'benzerini',
  'tekrar yap',
  'yeniden yap',
  'başka bir tane',
  'bir tane daha',
  'farklı bir',
  'farklı versiyonu',
  'anime yap',
  'karikatür yap',
  'cartoon yap',
  'çizgi film yap',
  'boyama yap',
  'siyah beyaz',
  'renkli yap',
  'renksiz yap',
  'vintage yap',
  'retro yap',
  'modern yap',
  'eski yap',
  'yeni yap',
  'resmi yap',
  'resmi değiştir',
  'resimi yap',
  'görseli yap',
  'görseli değiştir',
  // ✅ Location/position modifications
  'üstünde olsun',
  'üzerinde olsun',
  'altında olsun',
  'yanında olsun',
  'arkasında olsun',
  'önünde olsun',
  'içinde olsun',
  'elinde olsun',
  'elinin üstünde',
  'elinin üzerinde',
  'elinde tut',
  'masada olsun',
  'yerde olsun',
  'havada olsun',
  'suda olsun',
  'ormanda olsun',
  'şehirde olsun',
  'evde olsun',
  'bahçede olsun',
  // ✅ Generic follow-up patterns
  'ama bu sefer',
  'bu sefer',
  'şimdi de',
  'bir de',
  'aynı ama',
  'aynısı ama',
  'ayrıca',
  // ✅ Make it X patterns
  'olarak yap',
  'şeklinde yap',
  'gibi yap',
  'tarzında yap',
  // ✅ Color/style changes
  'rengini',
  'stilini',
  'tarzını',
];

// ==================== FARSÇA ====================
const PERSIAN_EDIT_KEYWORDS = [
  'واقعی‌تر',
  'بیشتر واقعی',
  'واقعی کن',
  'رنگش رو عوض کن',
  'پس‌زمینه رو عوض کن',
  'روشن‌تر',
  'تاریک‌تر',
  'بزرگ‌تر',
  'کوچک‌تر',
  'اضافه کن',
  'حذف کن',
  'تغییر بده',
  'بهتر کن',
  'یکی دیگه',
  'دوباره بساز',
  'مشابهش',
  'انیمه‌ای',
  'کارتونی',
];

// ==================== İNGİLİZCE ====================
const ENGLISH_EDIT_KEYWORDS = [
  'more realistic',
  'make it realistic',
  'more detailed',
  'add more detail',
  'change the color',
  'change colors',
  'change the background',
  'make it brighter',
  'make it darker',
  'make it bigger',
  'make it smaller',
  'zoom in',
  'zoom out',
  'add',
  'remove',
  'change',
  'modify',
  'edit',
  'improve',
  'enhance',
  'similar',
  'another one',
  'one more',
  'different version',
  'make it anime',
  'make it cartoon',
  'make it black and white',
  'make it colorful',
  'make it vintage',
  'make it modern',
  'redo',
  'try again',
  'regenerate',
];

/**
 * All image edit keywords combined
 * Used to detect follow-up image modification requests
 */
export const IMAGE_EDIT_KEYWORDS: readonly string[] = [
  ...TURKISH_EDIT_KEYWORDS,
  ...PERSIAN_EDIT_KEYWORDS,
  ...ENGLISH_EDIT_KEYWORDS,
] as const;

/**
 * Check if a message contains image edit keywords
 * @param message - The user message to check
 * @returns true if the message likely requests image modification
 */
export function containsImageEditKeyword(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return IMAGE_EDIT_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Style modification mapping for image edits
 * Maps Turkish/Persian keywords to English style modifiers for DALL-E
 */
export const STYLE_MODIFICATION_MAP: Record<string, string> = {
  // Realism
  realistik: 'photorealistic, ultra realistic',
  gerçekçi: 'photorealistic, ultra realistic',
  gerçek: 'photorealistic, realistic',
  'gerçek gibi': 'photorealistic like a real photograph',
  'gerçek hayat': 'photorealistic like a real photograph',
  'hayattaki gibi': 'photorealistic like a real photograph',
  'fotoğraf gibi': 'like a professional photograph',
  doğal: 'natural, realistic',

  // Detail
  detaylı: 'highly detailed, intricate details',
  'daha detaylı': 'more detailed, ultra detailed',

  // Lighting
  parlak: 'brighter lighting',
  karanlık: 'darker, moody lighting',
  aydınlık: 'well lit, bright',

  // Style
  anime: 'anime style',
  karikatür: 'cartoon style',
  cartoon: 'cartoon style',
  'çizgi film': 'cartoon animation style',
  'siyah beyaz': 'black and white, monochrome',
  vintage: 'vintage style, retro',
  retro: 'retro style',
  modern: 'modern style',

  // Composition
  yakın: 'close-up shot',
  uzak: 'wide shot',
  büyük: 'larger, zoomed in',
  küçük: 'smaller, zoomed out',
};

/**
 * Extract style modifiers from a user's modification request
 * @param userRequest - The user's modification request
 * @returns English style modifiers for DALL-E prompt
 */
export function extractImageModification(userRequest: string): string {
  const lowerRequest = userRequest.toLowerCase();
  const modifiers: string[] = [];

  for (const [keyword, modifier] of Object.entries(STYLE_MODIFICATION_MAP)) {
    if (lowerRequest.includes(keyword)) {
      modifiers.push(modifier);
    }
  }

  // If no specific modifier found, use the original request as style hint
  if (modifiers.length === 0) {
    return `make it ${userRequest}`;
  }

  return modifiers.join(', ');
}
