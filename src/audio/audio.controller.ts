import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// 20MB limit
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// Free: 30s, Premium: 60s
const FREE_MAX_DURATION = 30;
const PREMIUM_MAX_DURATION = 60;

@Controller('audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  /**
   * POST /api/v1/audio/transcribe
   * Whisper STT - Ses dosyasını metne çevir
   */
  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        // Accept common audio formats
        const allowedExtensions = ['webm', 'wav', 'mp3', 'mpeg', 'ogg', 'mp4', 'm4a', 'flac'];
        const ext = file.originalname?.split('.').pop()?.toLowerCase() || '';
        const mimeOk = file.mimetype.startsWith('audio/') || allowedExtensions.some(e => file.mimetype.includes(e));
        
        if (mimeOk || allowedExtensions.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Unsupported audio format'), false);
        }
      },
    }),
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No audio file provided');
    }

    const user = (req as any).user;
    const isPremium = user?.subscription?.plan === 'premium' || user?.isPremium;

    // Check duration limit (approximate from file size - ~16KB/s for webm audio at 128kbps)
    const estimatedDuration = file.size / (16 * 1024);
    const maxDuration = isPremium ? PREMIUM_MAX_DURATION : FREE_MAX_DURATION;

    if (estimatedDuration > maxDuration) {
      throw new BadRequestException(
        `Audio too long. Max ${maxDuration} seconds allowed.`,
      );
    }

    try {
      const text = await this.audioService.transcribeAudio(file.buffer, file.originalname || 'audio.webm');
      return { text };
    } catch (error: any) {
      console.error('[Transcribe] Error:', error);
      // Fallback message
      return { text: '', error: 'Anlaşılamadı, lütfen tekrar deneyin.' };
    }
  }

  /**
   * POST /api/v1/audio/speak
   * OpenAI TTS - Metni sese çevir
   */
  @Post('speak')
  @HttpCode(200)
  async speak(
    @Body() body: { text: string; voice?: string },
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const { text, voice } = body;

    if (!text || text.trim().length === 0) {
      throw new BadRequestException('No text provided');
    }

    // Limit text length (max 4096 chars for TTS)
    if (text.length > 4096) {
      throw new BadRequestException('Text too long. Max 4096 characters.');
    }

    const user = (req as any).user;
    const isPremium = user?.subscription?.plan === 'premium' || user?.isPremium;

    // Premium gets faster model (tts-1-hd), free gets standard (tts-1)
    const ttsModel = isPremium ? 'tts-1-hd' : 'tts-1';
    const selectedVoice = voice || 'alloy';

    try {
      const audioBuffer = await this.audioService.speakText(text, selectedVoice, ttsModel);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'no-cache',
      });

      res.send(audioBuffer);
    } catch (error: any) {
      console.error('[TTS] Error:', error);
      throw new BadRequestException(`TTS failed: ${error.message}`);
    }
  }
}
