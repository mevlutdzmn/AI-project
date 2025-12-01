import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { users } from '../database/schema';
import { eq, sql } from 'drizzle-orm';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    ) { }

    async findByEmail(email: string) {
        const [user] = await this.db
            .select()
            .from(users)
            .where(eq(users.email, email));
        return user ?? null;
    }

    async findById(id: number) {
        const [user] = await this.db.select().from(users).where(eq(users.id, id));
        return user ?? null;
    }

    async create(input: { email: string; password: string }) {
        const [user] = await this.db
            .insert(users)
            .values({
                email: input.email,
                password: input.password,
            })
            .returning();

        return user;
    }

    async incrementImageCredits(userId: number): Promise<void> {
        await this.db
            .update(users)
            .set({
                imageCredits: sql`COALESCE(${users.imageCredits}, 0) + 1`,
            })
            .where(eq(users.id, userId));
    }

    async getImageCredits(userId: number): Promise<number> {
        const [user] = await this.db
            .select({ imageCredits: users.imageCredits })
            .from(users)
            .where(eq(users.id, userId));
        return user?.imageCredits ?? 0;
    }

    async resetImageCredits(userId: number): Promise<void> {
        await this.db
            .update(users)
            .set({ imageCredits: 0 })
            .where(eq(users.id, userId));
    }

    async updateProfile(userId: number) {
        const [updatedUser] = await this.db
            .select({
                id: users.id,
                email: users.email,
                verified: users.verified,
                active: users.active,
                subscriptionExpiresAt: users.subscriptionExpiresAt,
            })
            .from(users)
            .where(eq(users.id, userId));

        return updatedUser;
    }
}
