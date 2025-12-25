import { Global, Module } from '@nestjs/common';
import { drizzleProvider } from './drizzle.provider';
import { ConfigModule } from '@nestjs/config';
import { AuditLogService } from '../common/services/audit-log.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [drizzleProvider, AuditLogService],
  exports: [drizzleProvider, AuditLogService],
})
export class DatabaseModule {}
