import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AIModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../database/database.module';
import { MemoryModule } from '../memory/memory.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [AIModule, UsersModule, DatabaseModule, MemoryModule, UsageModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
