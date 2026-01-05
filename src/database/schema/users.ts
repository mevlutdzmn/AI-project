import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  verified: boolean('verified').default(false).notNull(),
  verificationCode: text('verification_code'),
  verificationExpires: timestamp('verification_expires'),
  active: boolean('active').default(false).notNull(),
  isPremium: boolean('is_premium').default(false), // nullable for backward compatibility
  imageCredits: integer('image_credits').default(0), // Free users can only generate 1 image
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  resetToken: text('reset_token'),
  resetTokenExpiry: timestamp('reset_token_expiry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // ✅ Performance indexes for frequently queried columns
  emailIdx: index('idx_users_email').on(table.email),
  createdAtIdx: index('idx_users_created_at').on(table.createdAt),
  isPremiumIdx: index('idx_users_is_premium').on(table.isPremium),
}));
