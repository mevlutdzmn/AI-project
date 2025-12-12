import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [UsersModule, PaymentsModule, DatabaseModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
