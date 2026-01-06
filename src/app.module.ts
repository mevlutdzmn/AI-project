import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { AIModule } from './ai/ai.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { FilesModule } from './files/files.module';
import { MemoryModule } from './memory/memory.module';
import { ShareModule } from './share/share.module';
import { SettingsModule } from './settings/settings.module';
import { FoldersModule } from './folders/folders.module';
import { UsageModule } from './usage/usage.module';
import { AudioModule } from './audio/audio.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import openaiConfig from './config/openai.config';
import paymentConfig from './config/payment.config';
import { validationSchema } from './config/env.validation';

@Module({
  imports: [
    // ✅ Static files - serve /uploads directory
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        index: false,
        maxAge: '1d',
        setHeaders: (res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        },
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, openaiConfig, paymentConfig],
      validationSchema: validationSchema,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300, // 300 requests per minute (5 req/sec)
      },
    ]),
    DatabaseModule,
    CacheModule, // ✅ Redis/Memory cache support
    StorageModule, // ✅ Supabase Storage for Vercel deployment
    AuthModule,
    UsersModule,
    NotificationsModule,
    AIModule,
    ChatModule,
    PaymentsModule,
    AdminModule,
    FilesModule,
    MemoryModule,
    ShareModule,
    SettingsModule,
    FoldersModule,
    UsageModule,
    AudioModule,
    RealtimeModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard, // Custom rate limiting with per-endpoint limits
    },
  ],
})
export class AppModule {}
