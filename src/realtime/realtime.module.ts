import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [ConfigModule],
  controllers: [RealtimeController],
})
export class RealtimeModule {}
