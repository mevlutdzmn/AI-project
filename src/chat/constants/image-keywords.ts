/**
 * Image Generation Keywords
 * 
 * Multi-language keywords for detecting image generation requests.
 * Supports Turkish, Persian (Farsi), and English.
 * 
 * @module chat/constants/image-keywords
 * @description Single Responsibility: Only contains image detection keywords
 */

// ==================== TÜRKÇE ====================
const TURKISH_IMAGE_KEYWORDS = [
  // Fiil kombinasyonları
  'resim yap',
  'resmi yap',
  'resimi yap',
  // Yaygın yazım hataları
  'resim ypa',  // typo: ypa -> yap
  'resmi ypa',
  'resimi ypa',
  'resim yao',  // typo: yao -> yap
  'resmi yao',
  'resim uap',  // typo: uap -> yap
  'resmi uap',
  'resim çzi',  // typo: çzi -> çiz
  'resmi çzi',
  'resim yapı',  // typo
  'resmi yapı',
  'resim yaop',  // typo
  'resmi yaop',
  // Normal keywords devam
  'resim yapar mısın',
  'resmi yapar mısın',
  'resimi yapar mısın',
  'resim yaparmısın',
  'resmi yaparmısın',
  'resimi yaparmısın',
  'resim oluştur',
  'resmi oluştur',
  'resim çiz',
  'resmi çiz',
  'görsel yap',
  'görseli yap',
  'görsel oluştur',
  'görseli oluştur',
  'görsel çiz',
  'görseli çiz',
  'fotoğraf yap',
  'fotoğrafı yap',
  'fotoğrafını yap',
  'fotoğraf oluştur',
  'fotoğraf çiz',
  'resimini yap',
  'resmini yap',
  // İstek cümleleri
  'bir resim',
  'bana resim',
  'bana bir resim',
  'bana görsel',
  'bana bir görsel',
  'bana fotoğraf',
  'benim için resim',
  'benim için görsel',
  'resim istiyorum',
  'görsel istiyorum',
  'resim lazım',
  'görsel lazım',
  'resim ver',
  'görsel ver',
  'resim gönder',
  'görsel gönder',
  'resim üret',
  'görsel üret',
  'resim tasarla',
  'görsel tasarla',
  // Soru formları
  'resim yapabilir misin',
  'görsel yapabilir misin',
  'resim oluşturabilir misin',
  'görsel oluşturabilir misin',
  'resim çizebilir misin',
  'görsel çizebilir misin',
  'resim yapar mısın',
  'görsel yapar mısın',
  // Daha spesifik intent ifadeleri (tekil kelimeler çıkarıldı - false positive önleme)
  'bir logo tasarla',
  'bana logo yap',
  'logo çiz',
  'ikon tasarla',
  'poster yap',
  'afiş tasarla',
  'karikatür çiz',
  'anime karakteri çiz',
  'karakter tasarla',
  'manzara çiz',
  'portre çiz',
];

// ==================== FARSÇA (فارسی) ====================
const PERSIAN_IMAGE_KEYWORDS = [
  // Fiil kombinasyonları
  'تصویر بساز',
  'عکس بساز',
  'تصویر بکش',
  'عکس بکش',
  'تصویر درست کن',
  'عکس درست کن',
  'تصویر ایجاد کن',
  'عکس ایجاد کن',
  'نقاشی کن',
  'نقاشی بکش',
  'طراحی کن',
  'طراحی بکش',
  // İstek cümleleri
  'یک تصویر',
  'یه تصویر',
  'یک عکس',
  'یه عکس',
  'برام تصویر',
  'برایم تصویر',
  'برام عکس',
  'برایم عکس',
  'تصویر بده',
  'عکس بده',
  'تصویر میخوام',
  'عکس میخوام',
  'تصویر می‌خوام',
  'عکس می‌خوام',
  'تصویر لازم دارم',
  'عکس لازم دارم',
  'تصویر میخواهم',
  'عکس میخواهم',
  // Soru formları
  'تصویر میسازی',
  'عکس میسازی',
  'تصویر می‌سازی',
  'عکس می‌سازی',
  'میتونی تصویر',
  'میتونی عکس',
  'می‌تونی تصویر',
  'می‌تونی عکس',
  'میشه تصویر',
  'میشه عکس',
  'می‌شه تصویر',
  'می‌شه عکس',
  // Daha spesifik intent ifadeleri (tekil kelimeler çıkarıldı - false positive önleme)
  'لوگو طراحی کن',
  'لوگو بساز',
  'پوستر بساز',
  'پرتره بکش',
  'کاراکتر طراحی کن',
];

// ==================== İNGİLİZCE (English) ====================
const ENGLISH_IMAGE_KEYWORDS = [
  // Verb combinations
  'create image',
  'create a image',
  'create an image',
  'create picture',
  'create a picture',
  'create photo',
  'create a photo',
  'generate image',
  'generate a image',
  'generate an image',
  'generate picture',
  'generate a picture',
  'generate photo',
  'draw image',
  'draw a image',
  'draw an image',
  'draw picture',
  'draw a picture',
  'draw me',
  'draw a',
  'draw an',
  'make image',
  'make a image',
  'make an image',
  'make picture',
  'make a picture',
  'make me a',
  'make me an',
  // Request phrases
  'i want image',
  'i want a image',
  'i want an image',
  'i want picture',
  'i want a picture',
  'i need image',
  'i need a image',
  'i need an image',
  'i need picture',
  'give me image',
  'give me a image',
  'give me an image',
  'give me picture',
  'show me image',
  'show me a image',
  'show me an image',
  'show me picture',
  // Question forms
  'can you create',
  'can you generate',
  'can you draw',
  'can you make',
  'could you create',
  'could you generate',
  'could you draw',
  'would you create',
  'would you draw',
  'please create',
  'please generate',
  'please draw',
  // Daha spesifik intent ifadeleri (tekil kelimeler çıkarıldı - false positive önleme)
  'design a logo',
  'create a logo',
  'draw a portrait',
  'make a poster',
  'design an icon',
  'create artwork',
  'digital art of',
  'concept art of',
];

/**
 * All image generation keywords combined
 * Used to detect if a user message is requesting image generation
 */
export const IMAGE_KEYWORDS: readonly string[] = [
  ...TURKISH_IMAGE_KEYWORDS,
  ...PERSIAN_IMAGE_KEYWORDS,
  ...ENGLISH_IMAGE_KEYWORDS,
] as const;

/**
 * Code indicators - if message contains these, it's likely code discussion not image request
 * These help prevent false positives when users discuss code
 */
const CODE_INDICATORS = [
  // Code block markers
  '```',
  '`',
  // Programming keywords
  'function',
  'const ',
  'let ',
  'var ',
  'class ',
  'import ',
  'export ',
  'return ',
  'if (',
  'for (',
  'while (',
  'async ',
  'await ',
  'def ',
  'print(',
  'console.log',
  // HTML/CSS indicators
  '<div',
  '<span',
  '<style',
  '<script',
  '</div>',
  '</span>',
  'className=',
  'class="',
  'style="',
  'onclick',
  'href=',
  'src=',
  '@import',
  '@media',
  'border-radius',
  'background:',
  'padding:',
  'margin:',
  'display:',
  'position:',
  'flex',
  'grid',
  // File extensions
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.cpp',
  '.cs',
  '.html',
  '.css',
  // Turkish code discussion
  'kod yaz',
  'kodu yaz',
  'kodunu yaz',
  'kodunu göster',
  'kod örneği',
  'nasıl yazılır',
  'fonksiyon yaz',
  'fonksiyonu yaz',
  // Persian code discussion
  'کد بنویس',
  'کد رو بنویس',
  // English code discussion
  'write code',
  'code for',
  'write a function',
  'write the code',
  'show me the code',
  'code example',
  'how to code',
  'implement',
];

/**
 * Minimum message length that likely indicates code/technical content
 * Messages longer than this threshold with code indicators should never trigger image generation
 */
const LONG_MESSAGE_THRESHOLD = 500;

/**
 * Check if a message contains code indicators
 * @param message - The user message to check
 * @returns true if the message likely contains code discussion
 */
function containsCodeIndicator(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return CODE_INDICATORS.some((indicator) => lowerMessage.includes(indicator.toLowerCase()));
}

/**
 * Check if message looks like code/technical content
 * Uses multiple heuristics to detect code
 */
function looksLikeCode(message: string): boolean {
  // Check for code block markers
  if (message.includes('```') || message.includes('`')) {
    return true;
  }
  
  // Check for HTML-like content (simple check, not regex for performance)
  if (message.includes('<div') || message.includes('<span') || 
      message.includes('<style') || message.includes('<script') ||
      message.includes('</div>') || message.includes('</span>')) {
    return true;
  }
  
  // Check for CSS-like content (simple string check for performance)
  if (message.includes('border-radius') || message.includes('background:') ||
      message.includes('padding:') || message.includes('margin:') ||
      message.includes('display:') || message.includes('position:')) {
    return true;
  }
  
  // Check for JavaScript/TypeScript patterns (simple string checks)
  if (message.includes('function ') || message.includes('function(') ||
      message.includes('const ') || message.includes('let ') ||
      message.includes('=> {') || message.includes('=> (') ||
      message.includes('import ') || message.includes('export ')) {
    return true;
  }
  
  // Long messages with code indicators are likely code
  if (message.length > LONG_MESSAGE_THRESHOLD && containsCodeIndicator(message)) {
    return true;
  }
  
  return false;
}

/**
 * Action verbs that indicate image generation when combined with a subject
 * "uğur böceği çiz" -> "çiz" indicates drawing request
 * "bir kedi yap" -> "yap" in context indicates creation request
 */
const TURKISH_IMAGE_ACTION_VERBS = [
  'çiz',           // draw (en yaygın)
  'çizer misin',   // can you draw
  'çizebilir misin',
  'çizsene',       // draw it
  'çizin',         // draw (formal)
  'çizelim',       // let's draw
];

const ENGLISH_IMAGE_ACTION_VERBS = [
  'draw',
  'sketch',
  'paint',
  'illustrate',
];

const PERSIAN_IMAGE_ACTION_VERBS = [
  'بکش',           // draw
  'نقاشی کن',      // paint/draw
];

/**
 * Check if message ends with an image action verb
 * Detects patterns like: "uğur böceği çiz", "cat draw", "گربه بکش"
 */
function endsWithImageActionVerb(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check Turkish verbs
  for (const verb of TURKISH_IMAGE_ACTION_VERBS) {
    if (lowerMessage.endsWith(verb)) {
      return true;
    }
  }
  
  // Check English verbs
  for (const verb of ENGLISH_IMAGE_ACTION_VERBS) {
    if (lowerMessage.endsWith(verb)) {
      return true;
    }
  }
  
  // Check Persian verbs
  for (const verb of PERSIAN_IMAGE_ACTION_VERBS) {
    if (lowerMessage.endsWith(verb)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a message contains image generation keywords
 * Excludes messages that contain code indicators to prevent false positives
 * @param message - The user message to check
 * @returns true if the message likely requests image generation
 */
export function containsImageKeyword(message: string): boolean {
  // ✅ CRITICAL: Check if message looks like code FIRST
  // Long messages with code are NEVER image requests
  if (looksLikeCode(message)) {
    return false;
  }
  
  // Check for code indicators (simpler check)
  if (containsCodeIndicator(message)) {
    return false;
  }
  
  // Very long messages (>1000 chars) are unlikely to be image requests
  // Image requests are typically short like "resim yap", "görsel oluştur"
  if (message.length > 1000) {
    return false;
  }
  
  const lowerMessage = message.toLowerCase();
  
  // ✅ NEW: Check if message ends with image action verb
  // This catches: "uğur böceği çiz", "cat draw", etc.
  if (endsWithImageActionVerb(lowerMessage)) {
    return true;
  }
  
  return IMAGE_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}
