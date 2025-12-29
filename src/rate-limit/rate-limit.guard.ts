import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * Rate limit configuration interface
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

/**
 * Rate limit record for tracking requests
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
  firstRequest: number;
}

/**
 * Custom rate limit decorator key
 */
export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Default rate limit configurations per endpoint type
 * ✅ Professional production-ready limits
 * NOTE: Development mode has higher limits (NOT in test environment)
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const devMultiplier = isDevelopment ? 10 : 1; // 10x higher limits in dev only

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // 🔒 Authentication - strict to prevent brute force
  auth: { windowMs: 60000, maxRequests: 5 * devMultiplier }, // 5 req/min for login/register
  'auth-verify': { windowMs: 60000, maxRequests: 3 * devMultiplier }, // 3 req/min for verify/reset

  // 💬 Chat endpoints - moderate
  chat: { windowMs: 60000, maxRequests: 60 * devMultiplier }, // 60 req/min for chat (increased from 30)
  stream: { windowMs: 60000, maxRequests: 20 * devMultiplier }, // 20 req/min for streaming

  // 🔬 AI-heavy operations - expensive, strict limits
  research: { windowMs: 60000, maxRequests: 3 * devMultiplier }, // 3 req/min for deep research
  image: { windowMs: 60000, maxRequests: 10 * devMultiplier }, // 10 req/min for image generation
  realtime: { windowMs: 60000, maxRequests: 10 * devMultiplier }, // 10 req/min for voice chat

  // 📁 File operations
  upload: { windowMs: 60000, maxRequests: 10 * devMultiplier }, // 10 req/min for uploads

  // 🔊 Audio processing
  tts: { windowMs: 60000, maxRequests: 20 * devMultiplier }, // 20 req/min for TTS
  transcribe: { windowMs: 60000, maxRequests: 15 * devMultiplier }, // 15 req/min for transcription

  // 👨‍💼 Admin operations - moderate (trusted users)
  admin: { windowMs: 60000, maxRequests: 100 * devMultiplier }, // 100 req/min for admin

  // 💳 Payment operations - strict for security
  payment: { windowMs: 60000, maxRequests: 10 * devMultiplier }, // 10 req/min for payments

  // 🏥 Health checks - high limit for monitoring
  health: { windowMs: 60000, maxRequests: 300 * devMultiplier }, // 300 req/min for health checks

  // 📊 General API
  default: { windowMs: 60000, maxRequests: 120 * devMultiplier }, // 120 req/min default (increased from 60)
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly store = new Map<string, RateLimitRecord>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private reflector: Reflector) {
    // Cleanup expired records every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request should be allowed based on rate limits
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Get custom rate limit from decorator or use default
    const customLimit = this.reflector.getAllAndOverride<RateLimitConfig>(
      RATE_LIMIT_KEY,
      [handler, controller],
    );

    // Determine limit type based on path
    const limitType = this.getLimitType(request.path);
    const config =
      customLimit || DEFAULT_LIMITS[limitType] || DEFAULT_LIMITS.default;

    // Generate unique key for this client + endpoint
    const clientKey = this.getClientKey(request);
    const key = `${clientKey}:${limitType}`;

    const now = Date.now();
    const record = this.store.get(key);

    // First request or expired window
    if (!record || record.resetAt < now) {
      this.store.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
        firstRequest: now,
      });
      return true;
    }

    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      this.logger.warn(
        `Rate limit exceeded for ${clientKey} on ${limitType}: ${record.count}/${config.maxRequests}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    record.count++;
    return true;
  }

  /**
   * Get client identifier (IP + User ID if authenticated)
   */
  private getClientKey(request: Request): string {
    const ip = this.getClientIp(request);
    const userId = (request as any).user?.id || (request as any).user?.sub;
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  /**
   * Extract client IP address
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  /**
   * Determine rate limit type based on request path
   * ✅ Comprehensive endpoint matching
   */
  private getLimitType(path: string): string {
    // 🔒 Auth endpoints (strict)
    if (path.includes('/auth/login') || path.includes('/auth/register'))
      return 'auth';
    if (
      path.includes('/auth/verify') ||
      path.includes('/auth/reset') ||
      path.includes('/auth/forgot')
    )
      return 'auth-verify';
    if (path.includes('/auth/')) return 'auth';

    // 💬 Chat endpoints
    if (path.includes('/stream')) return 'stream';
    if (path.includes('/chat/')) return 'chat';

    // 🔬 AI-heavy operations
    if (path.includes('/research') || path.includes('/deep-research'))
      return 'research';
    if (
      path.includes('/image') ||
      path.includes('/generate') ||
      path.includes('/dalle')
    )
      return 'image';
    if (path.includes('/realtime')) return 'realtime';

    // 📁 File operations
    if (path.includes('/upload') || path.includes('/files')) return 'upload';

    // 🔊 Audio processing
    if (path.includes('/speak') || path.includes('/tts')) return 'tts';
    if (path.includes('/transcribe') || path.includes('/audio'))
      return 'transcribe';

    // 👨‍💼 Admin operations
    if (path.includes('/admin/')) return 'admin';

    // 💳 Payment operations
    if (
      path.includes('/payment') ||
      path.includes('/stripe') ||
      path.includes('/zarinpal')
    )
      return 'payment';

    // 🏥 Health checks
    if (path.includes('/health')) return 'health';

    return 'default';
  }

  /**
   * Cleanup expired records to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.store.entries()) {
      if (record.resetAt < now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit records`);
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
