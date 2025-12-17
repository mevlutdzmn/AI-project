import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY } from './rate-limit.guard';

/**
 * Custom rate limit decorator
 * Use this to set custom rate limits for specific endpoints
 *
 * @example
 * @RateLimit({ windowMs: 60000, maxRequests: 5 })
 * @Post('expensive-operation')
 * async expensiveOperation() { ... }
 */
export const RateLimit = (config: { windowMs: number; maxRequests: number }) =>
  SetMetadata(RATE_LIMIT_KEY, config);

/**
 * Skip rate limiting for specific endpoints
 */
export const SkipRateLimit = () =>
  SetMetadata(RATE_LIMIT_KEY, { windowMs: 0, maxRequests: Infinity });
