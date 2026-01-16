import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { sessions } from './sessions';

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user', 'assistant', 'system', 'function', 'tool'
  content: jsonb('content').notNull(), // Supports string or array of content parts
  model: text('model'), // GPT model used (e.g., 'gpt-5.2-auto', 'gpt-4o')
  inputType: text('input_type').default('text'), // 'text', 'voice', 'image' - ChatGPT-style tracking
  toolCalls: jsonb('tool_calls'), // Array of tool calls
  toolCallId: text('tool_call_id'), // For tool response messages
  // ✅ Multi-turn image editing context (GPT-5.2 Responses API)
  // Stores: { responseId: string, imageCallId: string, revisedPrompt?: string }
  imageContext: jsonb('image_context'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // ✅ Performance indexes for frequently queried columns
  sessionIdIdx: index('idx_messages_session_id').on(table.sessionId),
  createdAtIdx: index('idx_messages_created_at').on(table.createdAt),
  sessionIdCreatedAtIdx: index('idx_messages_session_created').on(table.sessionId, table.createdAt),
}));
