import { pgTable, serial, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { users } from "./users";

export const user_settings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  
  // General settings
  theme: text("theme").default("dark"),
  language: text("language").default("fa"),
  showExtraModels: boolean("show_extra_models").default(false),
  
  // Notification settings
  emailNotifications: boolean("email_notifications").default(true),
  browserNotifications: boolean("browser_notifications").default(false),
  
  // Data & Privacy settings
  saveHistory: boolean("save_history").default(true),
  improveModel: boolean("improve_model").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
