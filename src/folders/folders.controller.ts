import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FoldersService } from './folders.service';

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  async getFolders(@Request() req: AuthenticatedRequest) {
    return this.foldersService.getUserFolders((req.user as any).userId);
  }

  @Post()
  async createFolder(
    @Request() req: AuthenticatedRequest,
    @Body() body: { name: string; color?: string; icon?: string },
  ) {
    return this.foldersService.createFolder(
      (req.user as any).userId,
      body.name,
      body.color,
      body.icon,
    );
  }

  @Put(':id')
  async updateFolder(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; color?: string; icon?: string },
  ) {
    return this.foldersService.updateFolder(
      parseInt(id),
      (req.user as any).userId,
      body,
    );
  }

  @Delete(':id')
  async deleteFolder(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.foldersService.deleteFolder(parseInt(id), (req.user as any).userId);
  }

  @Get(':id/sessions')
  async getFolderSessions(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.foldersService.getFolderSessions(parseInt(id), (req.user as any).userId);
  }
}
