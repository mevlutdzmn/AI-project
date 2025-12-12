import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private usageService: UsageService) {}

  @Get('summary')
  async getSummary(
    @Request() req,
    @Query('days') days?: string
  ) {
    return this.usageService.getUserUsageSummary(
      req.user.userId,
      days ? parseInt(days) : 30
    );
  }

  @Get('logs')
  async getLogs(
    @Request() req,
    @Query('limit') limit?: string
  ) {
    return this.usageService.getRecentLogs(
      req.user.userId,
      limit ? parseInt(limit) : 50
    );
  }

  @Get('daily')
  async getDailyUsage(
    @Request() req,
    @Query('days') days?: string
  ) {
    return this.usageService.getDailyUsage(
      req.user.userId,
      days ? parseInt(days) : 7
    );
  }
}
