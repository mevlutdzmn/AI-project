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
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  default: { windowMs: 60000, maxRequests: 100 }, // 100 req/min
  auth: { windowMs: 60000, maxRequests: 10 }, // 10 req/min for auth
  chat: { windowMs: 60000, maxRequests: 30 }, // 30 req/min for chat
  research: { windowMs: 60000, maxRequests: 5 }, // 5 req/min for deep research
  upload: { windowMs: 60000, maxRequests: 10 }, // 10 req/min for uploads
  tts: { windowMs: 60000, maxRequests: 20 }, // 20 req/min for TTS
  admin: { windowMs: 60000, maxRequests: 50 }, // 50 req/min for admin
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
   */
  private getLimitType(path: string): string {
    if (path.includes('/auth/')) return 'auth';
    if (path.includes('/chat/') || path.includes('/stream')) return 'chat';
    if (path.includes('/deep-research')) return 'research';
    if (path.includes('/upload') || path.includes('/files')) return 'upload';
    if (path.includes('/audio/') || path.includes('/tts')) return 'tts';
    if (path.includes('/admin/')) return 'admin';
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
