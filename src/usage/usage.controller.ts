import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsageService } from './usage.service';
import { AuthenticatedRequest } from '../common/types';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private usageService: UsageService) {}

  @Get('summary')
  async getSummary(@Request() req: AuthenticatedRequest, @Query('days') days?: string) {
    return this.usageService.getUserUsageSummary(
      req.user.id,
      days ? parseInt(days) : 30,
    );
  }

  @Get('logs')
  async getLogs(@Request() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.usageService.getRecentLogs(
      req.user.id,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('daily')
  async getDailyUsage(@Request() req: AuthenticatedRequest, @Query('days') days?: string) {
    return this.usageService.getDailyUsage(
      req.user.id,
      days ? parseInt(days) : 7,
    );
  }
}
