import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE } from "../database/drizzle.provider";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";

interface UpdateSettingsDto {
  theme?: string;
  language?: string;
  showExtraModels?: boolean;
  emailNotifications?: boolean;
  browserNotifications?: boolean;
  saveHistory?: boolean;
  improveModel?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async getSettings(userId: number) {
    // Önce var olan ayarları bul
    let settings = await this.db
      .select()
      .from(schema.user_settings)
      .where(eq(schema.user_settings.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      // Kayıt yoksa upsert ile oluştur (race condition'ı önler)
      try {
        const newSettings = await this.db
          .insert(schema.user_settings)
          .values({
            userId,
            theme: "dark",
            language: "fa",
            showExtraModels: false,
            emailNotifications: true,
            browserNotifications: false,
            saveHistory: true,
            improveModel: false,
          })
          .onConflictDoNothing({ target: schema.user_settings.userId })
          .returning();

        if (newSettings.length > 0) {
          return newSettings[0];
        }
        
        // onConflictDoNothing çalıştıysa, kaydı tekrar çek
        settings = await this.db
          .select()
          .from(schema.user_settings)
          .where(eq(schema.user_settings.userId, userId))
          .limit(1);
      } catch {
        // Duplicate key hatası olursa, kaydı tekrar çek
        settings = await this.db
          .select()
          .from(schema.user_settings)
          .where(eq(schema.user_settings.userId, userId))
          .limit(1);
      }
    }

    return settings[0];
  }

  async updateSettings(userId: number, updateData: UpdateSettingsDto) {
    // Check if settings exist
    const existingSettings = await this.db
      .select()
      .from(schema.user_settings)
      .where(eq(schema.user_settings.userId, userId))
      .limit(1);

    if (existingSettings.length === 0) {
      // Create with provided data
      const newSettings = await this.db
        .insert(schema.user_settings)
        .values({
          userId,
          theme: updateData.theme ?? "dark",
          language: updateData.language ?? "fa",
          showExtraModels: updateData.showExtraModels ?? false,
          emailNotifications: updateData.emailNotifications ?? true,
          browserNotifications: updateData.browserNotifications ?? false,
          saveHistory: updateData.saveHistory ?? true,
          improveModel: updateData.improveModel ?? false,
        })
        .returning();

      return newSettings[0];
    }

    // Update existing settings
    const updated = await this.db
      .update(schema.user_settings)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(schema.user_settings.userId, userId))
      .returning();

    return updated[0];
  }

  async deleteSettings(userId: number) {
    await this.db
      .delete(schema.user_settings)
      .where(eq(schema.user_settings.userId, userId));

    return { message: "Settings deleted" };
  }
}
