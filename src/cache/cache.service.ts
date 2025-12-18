import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Redis-compatible Cache Service
 *
 * Bu servis Redis bağlantısı olmadan da çalışır (in-memory fallback).
 * Production'da Redis eklendiğinde otomatik geçiş yapar.
 *
 * Kullanım:
 * - User session cache
 * - Rate limiting data
 * - Frequently accessed data (user preferences, settings)
 * - API response caching
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private memoryCache: Map<string, { value: any; expires: number | null }> =
    new Map();
  private redisClient: any = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      try {
        // Dynamic import - Redis paketi yoksa hata vermez
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const redis = require('redis');
        this.redisClient = redis.createClient({ url: redisUrl });

        this.redisClient.on('error', (err: Error) => {
          this.logger.warn(
            'Redis connection error, falling back to memory cache:',
            err.message,
          );
          this.redisClient = null;
        });

        await this.redisClient.connect();
        this.logger.log('✅ Redis cache connected');
      } catch (error: any) {
        this.logger.warn('⚠️ Redis not available, using in-memory cache');
        this.redisClient = null;
      }
    } else {
      this.logger.log('📦 Using in-memory cache (no REDIS_URL configured)');
    }

    // Memory cache cleanup her 5 dakikada bir
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000,
    );
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  /**
   * Değer kaydet
   * @param key Cache anahtarı
   * @param value Kaydedilecek değer
   * @param ttl Saniye cinsinden yaşam süresi (opsiyonel)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.redisClient) {
      try {
        if (ttl) {
          await this.redisClient.setEx(key, ttl, serialized);
        } else {
          await this.redisClient.set(key, serialized);
        }
        return;
      } catch (error) {
        this.logger.warn('Redis set failed, using memory cache');
      }
    }

    // Memory cache fallback
    const expires = ttl ? Date.now() + ttl * 1000 : null;
    this.memoryCache.set(key, { value, expires });
  }

  /**
   * Değer oku
   * @param key Cache anahtarı
   * @returns Kaydedilmiş değer veya null
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.redisClient) {
      try {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        this.logger.warn('Redis get failed, using memory cache');
      }
    }

    // Memory cache fallback
    const cached = this.memoryCache.get(key);
    if (!cached) return null;

    // TTL kontrolü
    if (cached.expires && cached.expires < Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }

    return cached.value as T;
  }

  /**
   * Değer sil
   * @param key Cache anahtarı
   */
  async del(key: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (error) {
        this.logger.warn('Redis del failed');
      }
    }

    this.memoryCache.delete(key);
  }

  /**
   * Pattern ile değerleri sil
   * @param pattern Glob pattern (örn: "user:*")
   */
  async delByPattern(pattern: string): Promise<void> {
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
        return;
      } catch (error) {
        this.logger.warn('Redis delByPattern failed');
      }
    }

    // Memory cache fallback - basit pattern matching
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Anahtar var mı kontrol et
   */
  async exists(key: string): Promise<boolean> {
    if (this.redisClient) {
      try {
        return (await this.redisClient.exists(key)) === 1;
      } catch (error) {
        this.logger.warn('Redis exists failed');
      }
    }

    return this.memoryCache.has(key);
  }

  /**
   * TTL'i güncelle
   */
  async expire(key: string, ttl: number): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.expire(key, ttl);
        return;
      } catch (error) {
        this.logger.warn('Redis expire failed');
      }
    }

    const cached = this.memoryCache.get(key);
    if (cached) {
      cached.expires = Date.now() + ttl * 1000;
    }
  }

  /**
   * Sayaç artır (rate limiting için)
   */
  async incr(key: string): Promise<number> {
    if (this.redisClient) {
      try {
        return await this.redisClient.incr(key);
      } catch (error) {
        this.logger.warn('Redis incr failed');
      }
    }

    const cached = this.memoryCache.get(key);
    const newValue = (cached?.value || 0) + 1;
    this.memoryCache.set(key, {
      value: newValue,
      expires: cached?.expires || null,
    });
    return newValue;
  }

  /**
   * Süresi dolmuş entry'leri temizle
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires && entry.expires < now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Cache istatistikleri (debug için)
   */
  getStats(): { type: string; size: number } {
    return {
      type: this.redisClient ? 'redis' : 'memory',
      size: this.memoryCache.size,
    };
  }

  /**
   * Tüm cache'i temizle
   */
  async flush(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.flushDb();
        return;
      } catch (error) {
        this.logger.warn('Redis flush failed');
      }
    }

    this.memoryCache.clear();
  }
}

// Cache key generators - tutarlı key oluşturma için
export const CacheKeys = {
  // User cache keys
  user: (id: number) => `user:${id}`,
  userSessions: (id: number) => `user:${id}:sessions`,
  userSettings: (id: number) => `user:${id}:settings`,

  // Session cache keys
  session: (id: string) => `session:${id}`,
  sessionMessages: (id: string) => `session:${id}:messages`,

  // Rate limiting keys
  rateLimit: (ip: string, endpoint: string) => `rate:${ip}:${endpoint}`,

  // General cache keys
  stats: () => 'stats:dashboard',
  models: () => 'models:available',
};

// Cache TTL constants (seconds)
export const CacheTTL = {
  SHORT: 60, // 1 dakika
  MEDIUM: 300, // 5 dakika
  LONG: 3600, // 1 saat
  DAY: 86400, // 1 gün
  WEEK: 604800, // 1 hafta
};
