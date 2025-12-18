import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

const logger = new Logger('DatabaseProvider');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (configService: ConfigService) => {
    const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    // ✅ Production-ready connection pool settings
    const poolConfig = {
      max:
        configService.get<number>('DB_POOL_SIZE') || (isProduction ? 20 : 10),
      idle_timeout: configService.get<number>('DB_IDLE_TIMEOUT') || 20, // seconds
      connect_timeout: configService.get<number>('DB_CONNECT_TIMEOUT') || 10, // seconds
      max_lifetime: 60 * 30, // 30 minutes - prevent stale connections

      // ✅ Connection health checks
      onnotice: () => {}, // Suppress notice messages

      // ✅ SSL for production
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,

      // ✅ Prepared statements for better performance
      prepare: true,
    };

    logger.log(
      `🔌 Database pool initialized: max=${poolConfig.max}, idle=${poolConfig.idle_timeout}s`,
    );

    const client = postgres(databaseUrl, poolConfig);
    return drizzle(client, { schema });
  },
  inject: [ConfigService],
};
