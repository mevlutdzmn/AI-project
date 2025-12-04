import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../database/drizzle.provider';
import * as schema from '../database/schema';

@Injectable()
export class ShareService {
  constructor(
    @Inject(DRIZZLE)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  // ✅ Create share link
  async createShareLink(sessionId: string, userId: number, expiresInDays?: number) {
    // Verify session belongs to user
    const session = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session[0] || session[0].userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    // Check if share link already exists
    const existing = await this.db
      .select()
      .from(schema.sharedChats)
      .where(eq(schema.sharedChats.sessionId, sessionId))
      .limit(1);

    if (existing[0]) {
      return {
        shareToken: existing[0].shareToken,
        shareUrl: `/share/${existing[0].shareToken}`,
        expiresAt: existing[0].expiresAt,
      };
    }

    const shareToken = randomBytes(32).toString('hex');
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [result] = await this.db
      .insert(schema.sharedChats)
      .values({
        sessionId,
        shareToken,
        title: session[0].title,
        expiresAt,
      })
      .returning();

    return {
      shareToken: result.shareToken,
      shareUrl: `/share/${result.shareToken}`,
      expiresAt: result.expiresAt,
    };
  }

  // ✅ Get shared chat (public - no auth required)
  async getSharedChat(shareToken: string) {
    const shared = await this.db
      .select()
      .from(schema.sharedChats)
      .where(eq(schema.sharedChats.shareToken, shareToken))
      .limit(1);

    if (!shared[0]) {
      throw new NotFoundException('Shared chat not found');
    }

    // Check expiration
    if (shared[0].expiresAt && new Date() > shared[0].expiresAt) {
      throw new NotFoundException('Share link has expired');
    }

    // Increment view count
    await this.db
      .update(schema.sharedChats)
      .set({ viewCount: (shared[0].viewCount || 0) + 1 })
      .where(eq(schema.sharedChats.shareToken, shareToken));

    // Get messages
    const chatMessages = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, shared[0].sessionId))
      .orderBy(schema.messages.createdAt);

    return {
      title: shared[0].title,
      messages: chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      viewCount: (shared[0].viewCount || 0) + 1,
    };
  }

  // ✅ Delete share link
  async deleteShareLink(shareToken: string, userId: number) {
    const shared = await this.db
      .select({
        shareToken: schema.sharedChats.shareToken,
        sessionId: schema.sharedChats.sessionId,
      })
      .from(schema.sharedChats)
      .where(eq(schema.sharedChats.shareToken, shareToken))
      .limit(1);

    if (!shared[0]) {
      throw new NotFoundException('Share not found');
    }

    // Verify ownership
    const session = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, shared[0].sessionId))
      .limit(1);

    if (!session[0] || session[0].userId !== userId) {
      throw new NotFoundException('Share not found');
    }

    await this.db.delete(schema.sharedChats).where(eq(schema.sharedChats.shareToken, shareToken));
    return { success: true };
  }

  // ✅ Export to Markdown
  async exportToMarkdown(sessionId: string, userId: number): Promise<string> {
    const session = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session[0] || session[0].userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    const chatMessages = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .orderBy(schema.messages.createdAt);

    let markdown = `# ${session[0].title}\n\n`;
    markdown += `*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

    chatMessages.forEach((msg) => {
      const role = msg.role === 'user' ? '👤 **You**' : '🤖 **Assistant**';
      const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : '';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      markdown += `### ${role} - ${time}\n\n${content}\n\n---\n\n`;
    });

    return markdown;
  }

  // ✅ Export to JSON
  async exportToJson(sessionId: string, userId: number) {
    const session = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session[0] || session[0].userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    const chatMessages = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .orderBy(schema.messages.createdAt);

    return {
      title: session[0].title,
      createdAt: session[0].createdAt,
      exportedAt: new Date().toISOString(),
      messages: chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  }
}
