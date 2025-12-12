import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

// ✅ Shared Chats - Paylaşılan sohbetler
export const sharedChats = pgTable("shared_chats", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }),
  isPublic: boolean("is_public").default(true),
  expiresAt: timestamp("expires_at"),
  viewCount: integer("view_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
