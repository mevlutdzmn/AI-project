import {
    integer,
    pgTable,
    serial,
    text,
    timestamp,
    jsonb,
    uuid,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const messages = pgTable("messages", {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user', 'assistant', 'system', 'function', 'tool'
    content: jsonb("content").notNull(), // Supports string or array of content parts
    model: text("model"), // GPT model used (e.g., 'gpt-5.2-auto', 'gpt-4o')
    toolCalls: jsonb("tool_calls"), // Array of tool calls
    toolCallId: text("tool_call_id"), // For tool response messages
    createdAt: timestamp("created_at").notNull().defaultNow(),
});
