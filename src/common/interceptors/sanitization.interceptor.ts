import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

/**
 * Sanitization Interceptor
 * Cleans and sanitizes all incoming request data to prevent XSS and injection attacks
 */
@Injectable()
export class SanitizationInterceptor implements NestInterceptor {
  private readonly _logger = new Logger(SanitizationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    // Sanitize request body (body is mutable)
    if (request.body && typeof request.body === 'object') {
      request.body = this.sanitizeObject(request.body);
    }

    // Sanitize query parameters (query object properties are mutable, but not the object itself)
    if (request.query && typeof request.query === 'object') {
      this.sanitizeObjectInPlace(request.query);
    }

    // Sanitize route parameters (params object properties are mutable, but not the object itself)
    if (request.params && typeof request.params === 'object') {
      this.sanitizeObjectInPlace(request.params);
    }

    return next.handle();
  }

  /**
   * Sanitize object properties in place (for read-only objects like query and params)
   */
  private sanitizeObjectInPlace(obj: Record<string, any>): void {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string') {
        obj[key] = this.sanitizeString(value);
      } else if (Array.isArray(value)) {
        obj[key] = value.map((item) =>
          typeof item === 'string' ? this.sanitizeString(item) : item,
        );
      }
    }
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key as well (prevent prototype pollution)
        const sanitizedKey = this.sanitizeString(key);
        if (this.isValidKey(sanitizedKey)) {
          sanitized[sanitizedKey] = this.sanitizeObject(value);
        }
      }
      return sanitized;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    return obj;
  }

  /**
   * Sanitize a string value
   */
  private sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return str;
    }

    return (
      str
        // Remove null bytes
        .replace(/\0/g, '')
        // Encode HTML entities to prevent XSS
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        // Remove potential SQL injection patterns (basic)
        .replace(
          /(\b)(union|select|insert|update|delete|drop|truncate|exec|execute)(\b)/gi,
          '',
        )
        // Remove script tags and event handlers
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '')
        // Trim whitespace
        .trim()
    );
  }

  /**
   * Check if key is valid (prevent prototype pollution)
   */
  private isValidKey(key: string): boolean {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    return !dangerousKeys.includes(key.toLowerCase());
  }
}

/**
 * Light sanitization that preserves more content
 * Use for content that needs to support markdown/formatting
 */
@Injectable()
export class LightSanitizationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.body && typeof request.body === 'object') {
      request.body = this.lightSanitize(request.body);
    }

    return next.handle();
  }

  private lightSanitize(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.lightSanitize(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!['__proto__', 'constructor', 'prototype'].includes(key)) {
          sanitized[key] = this.lightSanitize(value);
        }
      }
      return sanitized;
    }

    if (typeof obj === 'string') {
      return obj
        .replace(/\0/g, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }

    return obj;
  }
}
