import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';

@Injectable()
export class MemoryService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  // ✅ Get all memories for user
  async getMemories(userId: number) {
    return this.db
      .select()
      .from(schema.userMemories)
      .where(eq(schema.userMemories.userId, userId));
  }

  // ✅ Add or update memory
  async setMemory(userId: number, key: string, value: string, category: string = 'general') {
    const existing = await this.db
      .select()
      .from(schema.userMemories)
      .where(and(eq(schema.userMemories.userId, userId), eq(schema.userMemories.key, key)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(schema.userMemories)
        .set({ value, category, updatedAt: new Date() })
        .where(and(eq(schema.userMemories.userId, userId), eq(schema.userMemories.key, key)))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(schema.userMemories)
      .values({ userId, key, value, category })
      .returning();
    return created;
  }

  // ✅ Delete memory
  async deleteMemory(userId: number, key: string) {
    return this.db
      .delete(schema.userMemories)
      .where(and(eq(schema.userMemories.userId, userId), eq(schema.userMemories.key, key)));
  }

  // ✅ Clear all memories
  async clearAllMemories(userId: number) {
    return this.db
      .delete(schema.userMemories)
      .where(eq(schema.userMemories.userId, userId));
  }

  // ✅ Get custom instructions
  async getCustomInstructions(userId: number) {
    const result = await this.db
      .select()
      .from(schema.customInstructions)
      .where(eq(schema.customInstructions.userId, userId))
      .limit(1);
    return result[0] || null;
  }

  // ✅ Set custom instructions
  async setCustomInstructions(
    userId: number,
    aboutUser: string | null,
    responseStyle: string | null,
    enabled: boolean = true
  ) {
    const existing = await this.getCustomInstructions(userId);

    if (existing) {
      const [updated] = await this.db
        .update(schema.customInstructions)
        .set({ aboutUser, responseStyle, enabled, updatedAt: new Date() })
        .where(eq(schema.customInstructions.userId, userId))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(schema.customInstructions)
      .values({ userId, aboutUser, responseStyle, enabled })
      .returning();
    return created;
  }

  // ✅ Build system prompt with memories and custom instructions
  async buildSystemPrompt(userId: number): Promise<string> {
    const [memories, instructions] = await Promise.all([
      this.getMemories(userId),
      this.getCustomInstructions(userId),
    ]);

    let systemPrompt = 'You are a helpful AI assistant.';

    // Add custom instructions if enabled
    if (instructions?.enabled) {
      if (instructions.aboutUser) {
        systemPrompt += `\n\nAbout the user:\n${instructions.aboutUser}`;
      }
      if (instructions.responseStyle) {
        systemPrompt += `\n\nHow to respond:\n${instructions.responseStyle}`;
      }
    }

    // Add memories
    if (memories.length > 0) {
      systemPrompt += '\n\nThings you remember about this user:';
      memories.forEach((m) => {
        systemPrompt += `\n- ${m.key}: ${m.value}`;
      });
    }

    return systemPrompt;
  }
}
