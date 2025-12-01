import {
    integer,
    pgTable,
    serial,
    text,
    timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const payments = pgTable("payments", {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
        .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    status: text("status").notNull(), // pending, completed, failed
    subscriptionEndDate: timestamp("subscription_end_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
