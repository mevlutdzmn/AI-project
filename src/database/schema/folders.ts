import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const folders = pgTable('folders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').default('#6366f1'),
  icon: text('icon').default('folder'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
