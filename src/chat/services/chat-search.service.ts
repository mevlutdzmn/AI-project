import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../../database/drizzle.provider';
import * as schema from '../../database/schema';
import {
  SearchQueryDto,
  SearchResultItem,
  SearchResponse,
} from '../dto/search-query.dto';

/**
 * ChatGPT-like Conversation Search Service
 *
 * Features:
 * - Full-text search on session titles and message content
 * - Hybrid ranking (lexical match + recency + pinned boost)
 * - Highlighted snippets with matched terms
 * - Security: Users can only search their own conversations
 */
@Injectable()
export class ChatSearchService {
  private readonly logger = new Logger(ChatSearchService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  /**
   * Search conversations and messages
   * Returns both session title matches and message content matches
   */
  async search(userId: number, query: SearchQueryDto): Promise<SearchResponse> {
    const startTime = Date.now();
    const searchTerm = this.sanitizeSearchTerm(query.query);

    if (!searchTerm || searchTerm.length < 2) {
      return {
        query: query.query,
        totalResults: 0,
        sessions: [],
        messages: [],
        took: Date.now() - startTime,
      };
    }

    this.logger.log(
      `[Search] User ${userId} searching for: "${searchTerm}" (limit: ${query.limit})`,
    );

    // Run both searches in parallel for better performance
    const [sessionResults, messageResults] = await Promise.all([
      this.searchSessions(userId, searchTerm, query),
      this.searchMessages(userId, searchTerm, query),
    ]);

    const took = Date.now() - startTime;
    this.logger.log(
      `[Search] Found ${sessionResults.length} sessions, ${messageResults.length} messages in ${took}ms`,
    );

    return {
      query: query.query,
      totalResults: sessionResults.length + messageResults.length,
      sessions: sessionResults,
      messages: messageResults,
      took,
    };
  }

  /**
   * Search session titles using full-text search
   */
  private async searchSessions(
    userId: number,
    searchTerm: string,
    query: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    try {
      const tsQuery = this.buildTsQuery(searchTerm);

      const results = await this.db.execute(sql`
        SELECT 
          s.id,
          s.title,
          s.pinned,
          s.archived,
          s.created_at,
          s.updated_at,
          ts_rank(s.search_vector, to_tsquery('english', ${tsQuery})) as rank,
          ts_headline('english', s.title, to_tsquery('english', ${tsQuery}),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=1'
          ) as highlighted
        FROM sessions s
        WHERE s.user_id = ${userId}
          AND s.is_deleted = false
          ${query.includeArchived ? sql`` : sql`AND s.archived = false`}
          ${query.pinnedOnly ? sql`AND s.pinned = true` : sql``}
          AND s.search_vector @@ to_tsquery('english', ${tsQuery})
        ORDER BY 
          s.pinned DESC,
          rank DESC,
          s.updated_at DESC
        LIMIT ${query.limit}
      `);

      return (results as any[]).map((row) => ({
        type: 'session' as const,
        sessionId: row.id,
        sessionTitle: row.title,
        isPinned: row.pinned,
        isArchived: row.archived,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        snippet: row.title,
        highlightedSnippet: row.highlighted || row.title,
        score: this.calculateScore(row.rank, row.created_at, row.pinned),
        matchType: 'title' as const,
      }));
    } catch (error) {
      this.logger.error(`[Search] Session search failed: ${error}`);
      return [];
    }
  }

  /**
   * Search message content using full-text search
   */
  private async searchMessages(
    userId: number,
    searchTerm: string,
    query: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    try {
      const tsQuery = this.buildTsQuery(searchTerm);

      const results = await this.db.execute(sql`
        SELECT 
          m.id as message_id,
          m.role,
          m.content,
          m.created_at as message_created_at,
          s.id as session_id,
          s.title as session_title,
          s.pinned,
          s.archived,
          s.created_at,
          s.updated_at,
          ts_rank(m.search_vector, to_tsquery('english', ${tsQuery})) as rank,
          ts_headline('english', 
            CASE 
              WHEN m.content NOT LIKE '[%' AND m.content NOT LIKE '{%' THEN 
                TRIM(BOTH '"' FROM m.content)
              ELSE 
                LEFT(TRIM(BOTH '"' FROM m.content), 500)
            END,
            to_tsquery('english', ${tsQuery}),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=1'
          ) as highlighted
        FROM messages m
        INNER JOIN sessions s ON m.session_id = s.id
        WHERE s.user_id = ${userId}
          AND s.is_deleted = false
          ${query.includeArchived ? sql`` : sql`AND s.archived = false`}
          ${query.pinnedOnly ? sql`AND s.pinned = true` : sql``}
          AND m.role IN ('user', 'assistant')
          AND m.search_vector @@ to_tsquery('english', ${tsQuery})
          AND m.content NOT LIKE '%data:image%'
        ORDER BY 
          s.pinned DESC,
          rank DESC,
          m.created_at DESC
        LIMIT ${query.limit}
      `);

      return (results as any[]).map((row) => ({
        type: 'message' as const,
        sessionId: row.session_id,
        sessionTitle: row.session_title,
        isPinned: row.pinned,
        isArchived: row.archived,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageId: row.message_id,
        messageRole: row.role,
        snippet: this.extractSnippet(row.content),
        highlightedSnippet: row.highlighted || this.extractSnippet(row.content),
        score: this.calculateScore(row.rank, row.message_created_at, row.pinned),
        matchType: 'content' as const,
      }));
    } catch (error) {
      this.logger.error(`[Search] Message search failed: ${error}`);
      return [];
    }
  }

  /**
   * Build PostgreSQL tsquery from user input
   * Handles multiple words and special characters
   */
  private buildTsQuery(term: string): string {
    // Split into words and join with OR for partial matching
    const words = term
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (words.length === 0) {
      return term.toLowerCase();
    }

    // Use OR between words and add prefix matching with :*
    return words.map((w) => `${w}:*`).join(' | ');
  }

  /**
   * Calculate final ranking score
   * Combines: lexical rank + recency + pinned boost
   */
  private calculateScore(
    lexicalRank: number,
    createdAt: Date,
    isPinned: boolean,
  ): number {
    // Recency factor (exponential decay, half-life 30 days)
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-0.023 * ageDays);

    // Pinned boost
    const pinBoost = isPinned ? 1.5 : 1.0;

    // Final score: 60% lexical, 30% recency, 10% pinned
    const finalScore =
      0.6 * (lexicalRank || 0) + 0.3 * recencyScore + 0.1 * (pinBoost - 1);

    return Math.round(finalScore * 1000) / 1000;
  }

  /**
   * Extract clean text snippet from content
   */
  private extractSnippet(content: string, maxLength: number = 200): string {
    if (!content) return '';

    // Remove JSON quotes
    let text = content.replace(/^"|"$/g, '');

    // If it's JSON array, try to extract text
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const textParts = parsed
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join(' ');
          text = textParts || text;
        }
      } catch {
        // Keep original
      }
    }

    // Truncate and add ellipsis
    if (text.length > maxLength) {
      text = text.substring(0, maxLength).trim() + '...';
    }

    return text;
  }

  /**
   * Sanitize search term to prevent injection
   */
  private sanitizeSearchTerm(term: string): string {
    if (!term || typeof term !== 'string') return '';

    return term
      .trim()
      .replace(/[<>'"\\;]/g, '') // Remove dangerous chars
      .substring(0, 500); // Limit length
  }

  /**
   * Get recent searches for autocomplete (optional feature)
   */
  async getRecentSearches(userId: number, limit: number = 5): Promise<string[]> {
    // This could be stored in a separate table or Redis
    // For now, return empty array
    return [];
  }
}
