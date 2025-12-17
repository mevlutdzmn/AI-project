/**
 * Application-wide constants
 * Centralizes all magic numbers and configuration values
 */

// ===========================================
// API & Request Configuration
// ===========================================
export const API_CONSTANTS = {
  /** Default timeout for API requests in milliseconds */
  REQUEST_TIMEOUT: 30000,
  /** Timeout for long-running operations like Deep Research */
  LONG_OPERATION_TIMEOUT: 300000,
  /** Default pagination limit */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum pagination limit */
  MAX_PAGE_SIZE: 100,
} as const;

// ===========================================
// Rate Limiting
// ===========================================
export const RATE_LIMIT = {
  /** Time window in milliseconds */
  WINDOW_MS: 60000,
  /** Default max requests per window */
  DEFAULT_MAX_REQUESTS: 100,
  /** Auth endpoints max requests */
  AUTH_MAX_REQUESTS: 10,
  /** Chat endpoints max requests */
  CHAT_MAX_REQUESTS: 30,
  /** Deep Research max requests */
  RESEARCH_MAX_REQUESTS: 5,
  /** File upload max requests */
  UPLOAD_MAX_REQUESTS: 10,
  /** TTS max requests */
  TTS_MAX_REQUESTS: 20,
} as const;

// ===========================================
// Deep Research Configuration
// ===========================================
export const DEEP_RESEARCH = {
  /** Delay between search queries in milliseconds */
  SEARCH_DELAY_MS: 2000,
  /** Maximum search queries per research session */
  MAX_SEARCH_QUERIES: 8,
  /** Minimum report length to consider valid */
  MIN_REPORT_LENGTH: 500,
  /** Target report length for expansion */
  TARGET_REPORT_LENGTH: 5000,
  /** Maximum tokens for final report generation */
  MAX_TOKENS_FINAL_REPORT: 16000,
  /** Maximum tokens for search queries */
  MAX_TOKENS_SEARCH: 4096,
  /** Session timeout in milliseconds (30 minutes) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  /** Polling interval for status checks */
  POLL_INTERVAL_MS: 3000,
} as const;

// ===========================================
// OpenAI Configuration
// ===========================================
export const OPENAI = {
  /** Default model */
  DEFAULT_MODEL: 'gpt-4o',
  /** Max tokens for chat completions */
  CHAT_MAX_TOKENS: 4096,
  /** Max tokens for Deep Research */
  RESEARCH_MAX_TOKENS: 16000,
  /** Temperature for creative responses */
  CREATIVE_TEMPERATURE: 0.8,
  /** Temperature for factual responses */
  FACTUAL_TEMPERATURE: 0.3,
  /** Default temperature */
  DEFAULT_TEMPERATURE: 0.7,
  /** TTS voice options */
  TTS_VOICES: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const,
  /** Default TTS voice */
  DEFAULT_TTS_VOICE: 'alloy',
} as const;

// ===========================================
// File Upload Configuration
// ===========================================
export const FILE_UPLOAD = {
  /** Maximum file size in bytes (50MB) */
  MAX_FILE_SIZE: 52428800,
  /** Maximum files per upload */
  MAX_FILES_PER_UPLOAD: 10,
  /** Allowed image MIME types */
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ] as const,
  /** Allowed document MIME types */
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'text/plain',
    'text/markdown',
  ] as const,
  /** Image size limit for chat (4MB) */
  CHAT_IMAGE_SIZE_LIMIT: 4194304,
} as const;

// ===========================================
// Authentication & Security
// ===========================================
export const AUTH = {
  /** JWT expiration time */
  JWT_EXPIRES_IN: '7d',
  /** Password minimum length */
  PASSWORD_MIN_LENGTH: 8,
  /** Password bcrypt rounds */
  BCRYPT_ROUNDS: 12,
  /** Reset token expiration in hours */
  RESET_TOKEN_EXPIRES_HOURS: 24,
  /** Maximum login attempts before lockout */
  MAX_LOGIN_ATTEMPTS: 5,
  /** Lockout duration in minutes */
  LOCKOUT_DURATION_MINUTES: 15,
} as const;

// ===========================================
// Caching
// ===========================================
export const CACHE = {
  /** Default cache TTL in seconds */
  DEFAULT_TTL: 300,
  /** Session cache TTL */
  SESSION_TTL: 3600,
  /** Static content cache TTL (1 day) */
  STATIC_CONTENT_TTL: 86400,
  /** User preferences cache TTL */
  USER_PREFERENCES_TTL: 1800,
} as const;

// ===========================================
// UI & Display
// ===========================================
export const UI = {
  /** Messages to load per page */
  MESSAGES_PER_PAGE: 20,
  /** Scroll threshold for "scroll to bottom" button */
  SCROLL_THRESHOLD_PX: 150,
  /** Debounce delay for search inputs */
  SEARCH_DEBOUNCE_MS: 300,
  /** Auto-save interval for drafts */
  AUTO_SAVE_INTERVAL_MS: 30000,
  /** Toast notification duration */
  TOAST_DURATION_MS: 5000,
  /** Animation durations */
  ANIMATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
  },
} as const;

// ===========================================
// TTS (Text-to-Speech)
// ===========================================
export const TTS = {
  /** Maximum text length for TTS */
  MAX_TEXT_LENGTH: 4000,
  /** Chunk size for long texts */
  CHUNK_SIZE: 3500,
} as const;

// ===========================================
// Validation Patterns
// ===========================================
export const PATTERNS = {
  /** Email regex pattern */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** URL regex pattern */
  URL: /^https?:\/\/.+/,
  /** UUID regex pattern */
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** Safe filename pattern */
  SAFE_FILENAME: /^[\w\-. ]+$/,
} as const;

// ===========================================
// Error Messages
// ===========================================
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'You are not authorized to perform this action',
  NOT_FOUND: 'The requested resource was not found',
  RATE_LIMIT: 'Too many requests. Please try again later',
  VALIDATION: 'Invalid input data',
  SERVER_ERROR: 'An unexpected error occurred',
  SESSION_EXPIRED: 'Your session has expired. Please log in again',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit',
  INVALID_FILE_TYPE: 'File type is not allowed',
} as const;

export default {
  API_CONSTANTS,
  RATE_LIMIT,
  DEEP_RESEARCH,
  OPENAI,
  FILE_UPLOAD,
  AUTH,
  CACHE,
  UI,
  TTS,
  PATTERNS,
  ERROR_MESSAGES,
};
