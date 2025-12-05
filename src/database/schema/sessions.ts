import {
    boolean,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const sessions = pgTable("sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Chat"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
