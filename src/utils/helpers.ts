/**
 * Common helper functions
 */
import * as crypto from 'crypto';

export function generateRandomString(length: number): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseBoolean(value: string | boolean): boolean {
  if (typeof value === 'boolean') return value;
  return value === 'true';
}
