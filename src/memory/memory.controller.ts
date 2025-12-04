import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryService } from './memory.service';

@ApiTags('Memory')
@ApiBearerAuth()
@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private memoryService: MemoryService) {}

  // ✅ Get all memories
  @Get()
  @ApiOperation({ summary: 'Get all memories for current user' })
  async getMemories(@Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.memoryService.getMemories(userId);
  }

  // ✅ Add/Update memory
  @Post()
  @ApiOperation({ summary: 'Add or update a memory' })
  async setMemory(
    @Request() req,
    @Body() body: { key: string; value: string; category?: string }
  ) {
    const userId = req.user.sub || req.user.id;
    return this.memoryService.setMemory(userId, body.key, body.value, body.category);
  }

  // ✅ Delete specific memory
  @Delete(':key')
  @ApiOperation({ summary: 'Delete a specific memory by key' })
  async deleteMemory(@Request() req, @Param('key') key: string) {
    const userId = req.user.sub || req.user.id;
    await this.memoryService.deleteMemory(userId, key);
    return { success: true };
  }

  // ✅ Clear all memories
  @Delete()
  @ApiOperation({ summary: 'Clear all memories for current user' })
  async clearAllMemories(@Request() req) {
    const userId = req.user.sub || req.user.id;
    await this.memoryService.clearAllMemories(userId);
    return { success: true };
  }

  // ✅ Get custom instructions
  @Get('instructions')
  @ApiOperation({ summary: 'Get custom instructions for current user' })
  async getInstructions(@Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.memoryService.getCustomInstructions(userId);
  }

  // ✅ Set custom instructions
  @Post('instructions')
  @ApiOperation({ summary: 'Set custom instructions for current user' })
  async setInstructions(
    @Request() req,
    @Body() body: { aboutUser?: string; responseStyle?: string; enabled?: boolean }
  ) {
    const userId = req.user.sub || req.user.id;
    return this.memoryService.setCustomInstructions(
      userId,
      body.aboutUser || null,
      body.responseStyle || null,
      body.enabled ?? true
    );
  }
}
