import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShareService } from './share.service';

@ApiTags('Share & Export')
@Controller('chat')
export class ShareController {
  constructor(private shareService: ShareService) {}

  // ✅ Create share link (requires auth)
  @Post('sessions/:sessionId/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a share link for a chat session' })
  async createShare(
    @Param('sessionId') sessionId: string,
    @Request() req,
    @Query('expiresInDays') expiresInDays?: string
  ) {
    const userId = req.user.sub || req.user.id;
    return this.shareService.createShareLink(
      sessionId,
      userId,
      expiresInDays ? parseInt(expiresInDays) : undefined
    );
  }

  // ✅ Get shared chat (public - no auth required)
  @Get('share/:shareToken')
  @ApiOperation({ summary: 'Get a shared chat by token (public)' })
  async getSharedChat(@Param('shareToken') shareToken: string) {
    return this.shareService.getSharedChat(shareToken);
  }

  // ✅ Delete share link
  @Delete('share/:shareToken')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a share link' })
  async deleteShare(@Param('shareToken') shareToken: string, @Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.shareService.deleteShareLink(shareToken, userId);
  }

  // ✅ Export to Markdown
  @Get('sessions/:sessionId/export/markdown')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export chat to Markdown format' })
  async exportMarkdown(
    @Param('sessionId') sessionId: string,
    @Request() req,
    @Res() res: Response
  ) {
    const userId = req.user.sub || req.user.id;
    const markdown = await this.shareService.exportToMarkdown(sessionId, userId);
    
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="chat-export.md"');
    res.send(markdown);
  }

  // ✅ Export to JSON
  @Get('sessions/:sessionId/export/json')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export chat to JSON format' })
  async exportJson(
    @Param('sessionId') sessionId: string,
    @Request() req,
    @Res() res: Response
  ) {
    const userId = req.user.sub || req.user.id;
    const json = await this.shareService.exportToJson(sessionId, userId);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="chat-export.json"');
    res.send(JSON.stringify(json, null, 2));
  }
}
