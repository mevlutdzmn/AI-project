import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ✅ User object from JWT Strategy (returns full user, not just payload)
interface JwtUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

interface UpdateSettingsDto {
  theme?: string;
  language?: string;
  showExtraModels?: boolean;
  emailNotifications?: boolean;
  browserNotifications?: boolean;
  saveHistory?: boolean;
  improveModel?: boolean;
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Req() req: Request & { user: JwtUser }) {
    const userId = req.user.id; // ✅ FIX: JWT Strategy returns full user object
    return this.settingsService.getSettings(userId);
  }

  @Put()
  async updateSettings(@Req() req: Request & { user: JwtUser }, @Body() updateData: UpdateSettingsDto) {
    const userId = req.user.id; // ✅ FIX: JWT Strategy returns full user object
    return this.settingsService.updateSettings(userId, updateData);
  }
}
