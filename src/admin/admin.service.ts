import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { users, payments, sessions, messages } from '../database/schema';
import { eq, desc, count, sql, gte, ilike } from 'drizzle-orm';
import { PasswordHasher } from '../common/utils/password-hasher';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Escape special characters in LIKE patterns to prevent SQL injection
   */
  private escapeLikePattern(term: string): string {
    return term.replace(/[%_\\]/g, '\\$&');
  }

  async getStats() {
    const [totalUsers] = await this.db.select({ count: count() }).from(users);
    const [activeUsers] = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.active, true));

    const [totalRevenue] = await this.db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(payments)
      .where(eq(payments.status, 'completed'));

    const [totalSessions] = await this.db
      .select({ count: count() })
      .from(sessions);
    const [totalMessages] = await this.db
      .select({ count: count() })
      .from(messages);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [recentRegistrations] = await this.db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));

    return {
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      totalRevenue: totalRevenue.total || 0,
      totalSessions: totalSessions.count,
      totalMessages: totalMessages.count,
      recentRegistrations: recentRegistrations.count,
    };
  }

  async getUsers(page: number = 1, limit: number = 10, search: string = '') {
    const offset = (page - 1) * limit;
    // Sanitize limit and page to prevent injection
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const safeOffset = (safePage - 1) * safeLimit;
    
    let usersList;

    if (search) {
      // ✅ Escape special LIKE characters to prevent SQL injection
      const safeSearch = this.escapeLikePattern(search.trim());
      usersList = await this.db
        .select()
        .from(users)
        .where(ilike(users.email, `%${safeSearch}%`))
        .limit(safeLimit)
        .offset(safeOffset)
        .orderBy(desc(users.createdAt));
    } else {
      usersList = await this.db
        .select()
        .from(users)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.createdAt));
    }

    const [totalCount] = await this.db.select({ count: count() }).from(users);

    // Remove passwords
    const safeUsers = usersList.map(({ password, ...user }) => user);

    return {
      users: safeUsers,
      total: totalCount.count,
      page,
      limit,
      totalPages: Math.ceil(totalCount.count / limit),
    };
  }

  async getUser(id: number) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));

    if (!user) {
      return null;
    }

    const { password, ...safeUser } = user;
    return safeUser;
  }

  async createUser(data: CreateUserDto) {
    const { email, password, isAdmin = false, active = true, isPremium = false, premiumDays = 30 } = data;
    
    this.logger.log(`Creating user: ${email}`);

    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await PasswordHasher.hash(password);

    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

    const [newUser] = await this.db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        verified: true,
        active,
        isAdmin,
        subscriptionExpiresAt: subscriptionEnd,
      })
      .returning();

    const { password: _, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUser(id: number, data: UpdateUserDto) {
    const updates: Partial<typeof users.$inferInsert> = {};
    
    this.logger.log(`Updating user: ${id}`);

    if (data.email) updates.email = data.email;
    if (data.password) {
      updates.password = await PasswordHasher.hash(data.password);
    }
    if (data.active !== undefined) updates.active = data.active;
    if (data.isAdmin !== undefined) updates.isAdmin = data.isAdmin;

    if (data.isPremium !== undefined) {
      updates.isPremium = data.isPremium;

      if (data.isPremium) {
        const days = data.premiumDays || 30;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        updates.subscriptionExpiresAt = expiryDate;
      } else {
        updates.subscriptionExpiresAt = null;
      }
    }

    if (data.subscriptionExpiresAt) {
      updates.subscriptionExpiresAt = new Date(data.subscriptionExpiresAt);
    }

    const [updatedUser] = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) {
      return null;
    }

    const { password, ...safeUser } = updatedUser;
    return safeUser;
  }

  async deleteUser(id: number, currentUserId: number) {
    if (currentUserId === id) {
      throw new Error('Cannot delete your own account');
    }

    const [deleted] = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    return deleted;
  }

  async getPayments(page: number = 1, limit: number = 20, status?: string) {
    const offset = (page - 1) * limit;

    const query = this.db
      .select({
        id: payments.id,
        userId: payments.userId,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
        email: users.email,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(payments.createdAt));

    if (status) {
      query.where(eq(payments.status, status));
    }

    const paymentsList = await query;

    const [totalCount] = await this.db
      .select({ count: count() })
      .from(payments);

    return {
      payments: paymentsList,
      total: totalCount.count,
      page,
      limit,
      totalPages: Math.ceil(totalCount.count / limit),
    };
  }

  async getSessions(userId?: number, limit: number = 100) {
    const query = this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        title: sessions.title,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        userEmail: users.email,
      })
      .from(sessions)
      .leftJoin(users, eq(sessions.userId, users.id))
      .limit(limit)
      .orderBy(desc(sessions.updatedAt));

    if (userId) {
      query.where(eq(sessions.userId, userId));
    }

    const sessionsList = await query;

    return {
      success: true,
      sessions: sessionsList,
      count: sessionsList.length,
    };
  }

  async getMessages(
    page: number = 1,
    limit: number = 50,
    userId?: number,
    sessionId?: string,
  ) {
    const offset = (page - 1) * limit;
    let countQuery;

    const baseQuery = this.db
      .select({
        id: messages.id,
        sessionId: messages.sessionId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        userId: sessions.userId,
        userEmail: users.email,
        sessionTitle: sessions.title,
      })
      .from(messages)
      .leftJoin(sessions, eq(messages.sessionId, sessions.id))
      .leftJoin(users, eq(sessions.userId, users.id))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(messages.createdAt));

    if (userId) {
      baseQuery.where(eq(sessions.userId, userId));
      countQuery = this.db
        .select({ count: count() })
        .from(messages)
        .leftJoin(sessions, eq(messages.sessionId, sessions.id))
        .where(eq(sessions.userId, userId));
    } else if (sessionId) {
      baseQuery.where(eq(messages.sessionId, sessionId));
      countQuery = this.db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.sessionId, sessionId));
    } else {
      countQuery = this.db.select({ count: count() }).from(messages);
    }

    const messagesList = await baseQuery;
    const [total] = await countQuery;

    return {
      messages: messagesList,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit),
    };
  }
}
