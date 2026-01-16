import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditLogService, AuditAction } from '../services/audit-log.service';

/**
 * Routes that should trigger audit logging
 */
const AUDIT_ROUTES: Record<string, { action: AuditAction; resource: string }> = {
  'POST /auth/login': { action: 'LOGIN', resource: 'auth' },
  'POST /auth/logout': { action: 'LOGOUT', resource: 'auth' },
  'POST /auth/register': { action: 'REGISTER', resource: 'auth' },
  'POST /auth/reset-password': { action: 'PASSWORD_RESET', resource: 'auth' },
  'PUT /settings': { action: 'SETTINGS_UPDATE', resource: 'settings' },
  'PATCH /settings': { action: 'SETTINGS_UPDATE', resource: 'settings' },
  'DELETE /chat/sessions': { action: 'CHAT_DELETE', resource: 'chat' },
  'POST /payment': { action: 'PAYMENT_SUCCESS', resource: 'payment' },
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, ip, headers, user } = request;
    const routeKey = `${method} ${path}`;
    const userAgent = headers['user-agent'];

    // Check if this route should be audited
    const auditConfig = Object.entries(AUDIT_ROUTES).find(([pattern]) => {
      const [patternMethod, patternPath] = pattern.split(' ');
      return method === patternMethod && path.startsWith(patternPath);
    });

    if (!auditConfig) {
      return next.handle();
    }

    const [, config] = auditConfig;
    const _startTime = Date.now();

    return next.handle().pipe(
      tap(async () => {
        // Log successful operation
        await this.auditLogService.log({
          userId: user?.id,
          action: config.action,
          resource: config.resource,
          resourceId: request.params?.id || request.body?.sessionId,
          status: 'success',
          ipAddress: ip,
          userAgent,
          metadata: {
            duration: Date.now() - _startTime,
          },
        });
      }),
      catchError(async (error) => {
        // Log failed operation
        await this.auditLogService.log({
          userId: user?.id,
          action: config.action,
          resource: config.resource,
          resourceId: request.params?.id || request.body?.sessionId,
          status: 'failure',
          ipAddress: ip,
          userAgent,
          errorMessage: error.message,
          metadata: {
            duration: Date.now() - _startTime,
          },
        });
        throw error;
      }),
    );
  }
}
