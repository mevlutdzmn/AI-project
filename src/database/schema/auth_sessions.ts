import { integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const authSessions = pgTable('auth_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshToken: text('refresh_token').notNull().unique(),
  deviceInfo: varchar('device_info', { length: 512 }), // User-Agent
  ipAddress: varchar('ip_address', { length: 45 }), // IPv4/IPv6
  fingerprint: varchar('fingerprint', { length: 64 }), // Session fingerprint
  lastUsedAt: timestamp('last_used_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
