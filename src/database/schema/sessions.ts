import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { folders } from './folders';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New Chat'),
  pinned: boolean('pinned').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  folderId: integer('folder_id').references(() => folders.id, {
    onDelete: 'set null',
  }),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // ✅ Performance indexes for frequently queried columns
  userIdIdx: index('idx_sessions_user_id').on(table.userId),
  updatedAtIdx: index('idx_sessions_updated_at').on(table.updatedAt),
  userIdUpdatedAtIdx: index('idx_sessions_user_updated').on(table.userId, table.updatedAt),
  isDeletedIdx: index('idx_sessions_is_deleted').on(table.isDeleted),
}));
