import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ✅ Shared Messages - Paylaşılan tek mesajlar
export const sharedMessages = pgTable("shared_messages", {
  id: serial("id").primaryKey(),
  shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
  content: text("content").notNull(),
  role: varchar("role", { length: 20 }).default("assistant"),
  userId: integer("user_id"),
  viewCount: integer("view_count").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
