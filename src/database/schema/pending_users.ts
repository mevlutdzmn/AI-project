import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

export const pending_users = pgTable('pending_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  verificationCode: varchar('verification_code', { length: 6 }).notNull(),
  verificationExpires: timestamp('verification_expires', {
    mode: 'date',
  }).notNull(),
  verified: boolean('verified').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
