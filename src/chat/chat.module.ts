import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AIModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../database/database.module';
import { MemoryModule } from '../memory/memory.module';
import { UsageModule } from '../usage/usage.module';

// SOLID: Specialized services for Single Responsibility
import {
  ChatImageService,
  ChatPdfService,
  ChatResearchService,
  ChatTitleService,
  ChatVoiceService,
} from './services';

@Module({
  imports: [AIModule, UsersModule, DatabaseModule, MemoryModule, UsageModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    // SOLID: Each service has a single responsibility
    ChatImageService,
    ChatPdfService,
    ChatResearchService,
    ChatTitleService,
    ChatVoiceService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
