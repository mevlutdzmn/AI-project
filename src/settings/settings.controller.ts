import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

interface UpdateSettingsDto {
  theme?: string;
  language?: string;
  showExtraModels?: boolean;
  emailNotifications?: boolean;
  browserNotifications?: boolean;
  saveHistory?: boolean;
  improveModel?: boolean;
}

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Req() req: any) {
    const userId = req.user.id;
    return this.settingsService.getSettings(userId);
  }

  @Put()
  async updateSettings(
    @Req() req: any,
    @Body() updateData: UpdateSettingsDto,
  ) {
    const userId = req.user.id;
    return this.settingsService.updateSettings(userId, updateData);
  }
}
