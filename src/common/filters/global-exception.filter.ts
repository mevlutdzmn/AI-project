import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Global Exception Filter with Sentry Integration
 * Catches all exceptions and logs them appropriately
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Get error message
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // Get detailed error info
    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message };

    // Create error details object
    const errorDetails = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message:
        typeof errorResponse === 'string'
          ? errorResponse
          : (errorResponse as any).message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
    };

    // Log error
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );

      // Send to Sentry for 5xx errors
      this.captureToSentry(exception, request, status);
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} - ${status}: ${message}`,
      );
    }

    // Send response
    response.status(status).json(errorDetails);
  }

  /**
   * Capture exception to Sentry
   */
  private captureToSentry(
    exception: unknown,
    request: Request,
    status: number,
  ): void {
    // Check if Sentry is initialized
    if (!process.env.SENTRY_DSN) {
      return;
    }

    Sentry.withScope((scope) => {
      // Add request info
      scope.setExtra('url', request.url);
      scope.setExtra('method', request.method);
      scope.setExtra('statusCode', status);
      scope.setExtra('headers', this.sanitizeHeaders(request.headers));
      scope.setExtra('query', request.query);
      scope.setExtra('body', this.sanitizeBody(request.body));

      // Add user info if available
      if ((request as any).user) {
        scope.setUser({
          id: String((request as any).user.id || (request as any).user.sub),
          email: (request as any).user.email,
        });
      }

      // Capture exception
      if (exception instanceof Error) {
        Sentry.captureException(exception);
      } else {
        Sentry.captureMessage(String(exception), 'error');
      }
    });
  }

  /**
   * Remove sensitive headers before logging
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Remove sensitive body fields before logging
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'creditCard',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

/**
 * Initialize Sentry for backend
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('[Sentry] DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Integrations
    integrations: [Sentry.httpIntegration()],

    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive data
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      return event;
    },
  });
}
