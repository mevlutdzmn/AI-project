import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ZarinpalAdapter } from './zarinpal.adapter';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, ZarinpalAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}
