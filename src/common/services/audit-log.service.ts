import { Injectable, Logger, Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { auditLogs } from '../../database/schema';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTER'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'EMAIL_VERIFY'
  | 'SESSION_CREATE'
  | 'SESSION_REVOKE'
  | 'SETTINGS_UPDATE'
  | 'CHAT_CREATE'
  | 'CHAT_DELETE'
  | 'FILE_UPLOAD'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'API_ERROR';

export interface AuditLogEntry {
  userId?: number;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  status?: 'success' | 'failure';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        userId: entry.userId || null,
        action: entry.action,
        resource: entry.resource || null,
        resourceId: entry.resourceId || null,
        status: entry.status || 'success',
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent?.substring(0, 512) || null,
        metadata: entry.metadata || null,
        errorMessage: entry.errorMessage || null,
      });
    } catch (error) {
      // Don't throw - audit logging should never break the main flow
      this.logger.error('Failed to write audit log', error);
    }
  }

  /**
   * Log a successful login
   */
  async logLogin(userId: number, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      userId,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log a failed login attempt
   */
  async logLoginFailed(email: string, ipAddress?: string, userAgent?: string, reason?: string): Promise<void> {
    await this.log({
      action: 'LOGIN_FAILED',
      resource: 'auth',
      status: 'failure',
      ipAddress,
      userAgent,
      metadata: { email },
      errorMessage: reason,
    });
  }

  /**
   * Log logout
   */
  async logLogout(userId: number, ipAddress?: string): Promise<void> {
    await this.log({
      userId,
      action: 'LOGOUT',
      resource: 'auth',
      ipAddress,
    });
  }

  /**
   * Log password change
   */
  async logPasswordChange(userId: number, ipAddress?: string): Promise<void> {
    await this.log({
      userId,
      action: 'PASSWORD_CHANGE',
      resource: 'auth',
      ipAddress,
    });
  }

  /**
   * Log settings update
   */
  async logSettingsUpdate(userId: number, settingType: string, ipAddress?: string): Promise<void> {
    await this.log({
      userId,
      action: 'SETTINGS_UPDATE',
      resource: 'settings',
      resourceId: settingType,
      ipAddress,
    });
  }

  /**
   * Log chat session creation
   */
  async logChatCreate(userId: number, sessionId: string): Promise<void> {
    await this.log({
      userId,
      action: 'CHAT_CREATE',
      resource: 'chat',
      resourceId: sessionId,
    });
  }

  /**
   * Log chat session deletion
   */
  async logChatDelete(userId: number, sessionId: string): Promise<void> {
    await this.log({
      userId,
      action: 'CHAT_DELETE',
      resource: 'chat',
      resourceId: sessionId,
    });
  }

  /**
   * Log payment
   */
  async logPayment(userId: number, status: 'success' | 'failure', amount?: number, errorMessage?: string): Promise<void> {
    await this.log({
      userId,
      action: status === 'success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
      resource: 'payment',
      status,
      metadata: { amount },
      errorMessage,
    });
  }

  /**
   * Log API error
   */
  async logApiError(userId: number | undefined, path: string, errorMessage: string, ipAddress?: string): Promise<void> {
    await this.log({
      userId,
      action: 'API_ERROR',
      resource: path,
      status: 'failure',
      ipAddress,
      errorMessage,
    });
  }
}
