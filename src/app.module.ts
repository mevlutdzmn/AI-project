import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { AIModule } from './ai/ai.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { FilesModule } from './files/files.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import openaiConfig from './config/openai.config';
import paymentConfig from './config/payment.config';
import { validationSchema } from './config/env.validation';

@Module({
  imports: [
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
    AuthModule,
    UsersModule,
    NotificationsModule,
    AIModule,
    ChatModule,
    PaymentsModule,
    AdminModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
