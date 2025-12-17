/**
 * Common TypeScript interfaces used across the application
 */

import { Request } from 'express';

// ===========================================
// User & Authentication Types
// ===========================================

export interface User {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  isAdmin: boolean;
  isPremium: boolean;
  premiumUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithoutPassword extends Omit<User, 'password'> {}

export interface JwtPayload {
  sub: number;
  email: string;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// ===========================================
// Chat Types
// ===========================================

export interface Message {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  userId: number;
  title: string | null;
  model: string | null;
  folderId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageDto {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// ===========================================
// Deep Research Types
// ===========================================

export interface ResearchStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
}

export interface DeepResearchSession {
  id: string;
  userId: number;
  query: string;
  status: 'pending' | 'researching' | 'analyzing' | 'completed' | 'failed';
  steps: ResearchStep[];
  progress: number;
  output_text?: string;
  sources?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchPlan {
  understanding: string;
  searchQueries: string[];
  analysisApproach: string;
}

// ===========================================
// File Upload Types
// ===========================================

export interface UploadedFile {
  id: number;
  userId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: Date;
}

export interface FileUploadResult {
  success: boolean;
  file?: UploadedFile;
  error?: string;
}

// ===========================================
// Payment Types
// ===========================================

export interface Subscription {
  id: string;
  userId: number;
  stripeSubscriptionId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  plan: 'monthly' | 'yearly';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  clientSecret: string;
}

// ===========================================
// Settings Types
// ===========================================

export interface UserSettings {
  userId: number;
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'fa' | 'tr';
  fontSize: 'small' | 'medium' | 'large';
  sendWithEnter: boolean;
  showTimestamps: boolean;
  enableSounds: boolean;
  defaultModel: string;
}

// ===========================================
// Admin Types
// ===========================================

export interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  totalSessions: number;
  totalMessages: number;
  activeUsers24h: number;
  revenue: number;
}

export interface UserListItem {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isPremium: boolean;
  createdAt: Date;
  lastActive: Date | null;
  messageCount: number;
}

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  timestamp?: string;
  path?: string;
}

// ===========================================
// Drizzle Database Type
// ===========================================

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../../database/schema';

export type DrizzleDB = PostgresJsDatabase<typeof schema>;

// Generic database interface for services that don't need full schema access
export interface DrizzleDatabase {
  select: (...args: unknown[]) => unknown;
  insert: (...args: unknown[]) => unknown;
  update: (...args: unknown[]) => unknown;
  delete: (...args: unknown[]) => unknown;
  execute: (query: unknown) => Promise<unknown>;
  transaction: <T>(fn: (tx: DrizzleDatabase) => Promise<T>) => Promise<T>;
}
