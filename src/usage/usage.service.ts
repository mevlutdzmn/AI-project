import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, desc } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/drizzle.provider';
import * as schema from '../database/schema';

// Token fiyatları (USD per 1K tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-5.2-auto': { input: 0.01, output: 0.03 },
  'gpt-5.2-instant': { input: 0.005, output: 0.015 },
  'gpt-5.2-thinking': { input: 0.02, output: 0.06 },
  'gpt-5.2-pro': { input: 0.03, output: 0.09 },
};

@Injectable()
export class UsageService {
  constructor(
    @Inject(DRIZZLE)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  // Log usage
  async logUsage(
    userId: number,
    model: string,
    promptTokens: number,
    completionTokens: number,
    sessionId?: string
  ) {
    const pricing = MODEL_PRICING[model] || { input: 0.001, output: 0.002 };
    const cost = (promptTokens / 1000) * pricing.input + (completionTokens / 1000) * pricing.output;

    const [log] = await this.db
      .insert(schema.usageLogs)
      .values({
        userId,
        model,
        tokensUsed: promptTokens + completionTokens,
        promptTokens,
        completionTokens,
        cost: cost.toFixed(6),
        sessionId,
      })
      .returning();

    return log;
  }

  // Get user usage summary
  async getUserUsageSummary(userId: number, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await this.db
      .select()
      .from(schema.usageLogs)
      .where(
        and(
          eq(schema.usageLogs.userId, userId),
          gte(schema.usageLogs.createdAt, since)
        )
      );

    const totalTokens = logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
    const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);

    // Group by model
    const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const log of logs) {
      if (!byModel[log.model]) {
        byModel[log.model] = { tokens: 0, cost: 0, count: 0 };
      }
      byModel[log.model].tokens += log.tokensUsed || 0;
      byModel[log.model].cost += parseFloat(log.cost || '0');
      byModel[log.model].count += 1;
    }

    return {
      totalTokens,
      totalCost: totalCost.toFixed(4),
      totalRequests: logs.length,
      byModel,
      period: `${days} days`,
    };
  }

  // Get recent usage logs
  async getRecentLogs(userId: number, limit: number = 50) {
    return this.db
      .select()
      .from(schema.usageLogs)
      .where(eq(schema.usageLogs.userId, userId))
      .orderBy(desc(schema.usageLogs.createdAt))
      .limit(limit);
  }

  // Get daily usage for chart
  async getDailyUsage(userId: number, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await this.db
      .select()
      .from(schema.usageLogs)
      .where(
        and(
          eq(schema.usageLogs.userId, userId),
          gte(schema.usageLogs.createdAt, since)
        )
      );

    // Group by date
    const byDate: Record<string, { tokens: number; cost: number; requests: number }> = {};
    for (const log of logs) {
      const date = log.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { tokens: 0, cost: 0, requests: 0 };
      }
      byDate[date].tokens += log.tokensUsed || 0;
      byDate[date].cost += parseFloat(log.cost || '0');
      byDate[date].requests += 1;
    }

    return byDate;
  }
}
