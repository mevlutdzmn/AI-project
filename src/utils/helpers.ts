/**
 * Common helper functions
 */

export function generateRandomString(length: number): string {
    return Array(length)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
}

export function formatDate(date: Date): string {
    return date.toISOString();
}

export function parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true';
}
