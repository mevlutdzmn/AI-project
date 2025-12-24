import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface JwtUser {
  sub: number;
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
    const userId = req.user.sub;
    return this.settingsService.getSettings(userId);
  }

  @Put()
  async updateSettings(@Req() req: Request & { user: JwtUser }, @Body() updateData: UpdateSettingsDto) {
    const userId = req.user.sub;
    return this.settingsService.updateSettings(userId, updateData);
  }
}
