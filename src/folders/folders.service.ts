import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/drizzle.provider';
import * as schema from '../database/schema';

@Injectable()
export class FoldersService {
  constructor(
    @Inject(DRIZZLE)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async getUserFolders(userId: number) {
    return this.db
      .select()
      .from(schema.folders)
      .where(eq(schema.folders.userId, userId))
      .orderBy(schema.folders.name);
  }

  async createFolder(userId: number, name: string, color?: string, icon?: string) {
    const [folder] = await this.db
      .insert(schema.folders)
      .values({ userId, name, color, icon })
      .returning();
    return folder;
  }

  async updateFolder(folderId: number, userId: number, data: { name?: string; color?: string; icon?: string }) {
    const [existing] = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, folderId), eq(schema.folders.userId, userId)));
    
    if (!existing) throw new NotFoundException('Folder not found');

    const [updated] = await this.db
      .update(schema.folders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.folders.id, folderId))
      .returning();
    return updated;
  }

  async deleteFolder(folderId: number, userId: number) {
    const [existing] = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, folderId), eq(schema.folders.userId, userId)));
    
    if (!existing) throw new NotFoundException('Folder not found');

    // Remove folder_id from sessions in this folder
    await this.db
      .update(schema.sessions)
      .set({ folderId: null })
      .where(eq(schema.sessions.folderId, folderId));

    await this.db
      .delete(schema.folders)
      .where(eq(schema.folders.id, folderId));

    return { success: true };
  }

  async getFolderSessions(folderId: number, userId: number) {
    const [folder] = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, folderId), eq(schema.folders.userId, userId)));
    
    if (!folder) throw new NotFoundException('Folder not found');

    return this.db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.folderId, folderId),
          eq(schema.sessions.isDeleted, false)
        )
      );
  }
}
