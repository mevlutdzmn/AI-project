import { integer, pgTable, serial, text, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Audit logs table for tracking critical operations
 * GDPR/Security compliance
 */
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(), // e.g., 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE'
  resource: varchar('resource', { length: 100 }), // e.g., 'auth', 'chat', 'settings'
  resourceId: varchar('resource_id', { length: 255 }), // e.g., session ID, message ID
  status: varchar('status', { length: 20 }).notNull().default('success'), // 'success', 'failure'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  metadata: jsonb('metadata'), // Additional context
  errorMessage: text('error_message'), // If status is 'failure'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
