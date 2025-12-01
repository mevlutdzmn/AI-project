import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
    provide: DRIZZLE,
    useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
        const poolSize = configService.get<number>('DB_POOL_SIZE') || 10;
        const client = postgres(databaseUrl, { max: poolSize });
        return drizzle(client, { schema });
    },
    inject: [ConfigService],
};
