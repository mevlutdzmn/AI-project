import { IsString, IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchQueryDto {
  @ApiProperty({
    description: 'Search query string',
    example: 'canvas error',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Include archived conversations in search',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean = false;

  @ApiPropertyOptional({
    description: 'Search only in pinned conversations',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  pinnedOnly?: boolean = false;
}

export interface SearchResultItem {
  type: 'session' | 'message';
  sessionId: string;
  sessionTitle: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  // For message results
  messageId?: number;
  messageRole?: string;
  snippet: string;
  highlightedSnippet: string;
  // Ranking
  score: number;
  matchType: 'title' | 'content';
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  sessions: SearchResultItem[]; // Title matches
  messages: SearchResultItem[]; // Content matches
  took: number; // Time in ms
}
