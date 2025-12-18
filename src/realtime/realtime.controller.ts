import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);
  constructor(private configService: ConfigService) {}

  /**
   * GET /api/v1/realtime/token
   * OpenAI Realtime API için ephemeral token oluşturur
   * Client bu token ile direkt OpenAI'a bağlanır
   */
  @Get('token')
  async getToken(@Req() req: Request, @Res() res: Response) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.error('Missing OPENAI_API_KEY');
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Missing server OPENAI_API_KEY',
      });
    }

    try {
      this.logger.debug('Creating ephemeral token for Realtime API...');

      // OpenAI'dan ephemeral token al
      const response = await fetch(
        'https://api.openai.com/v1/realtime/sessions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-realtime-preview-2024-12-17',
            voice: 'alloy',
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`OpenAI token error: ${JSON.stringify(data)}`);
        return res.status(response.status).json(data);
      }

      this.logger.debug('Ephemeral token created successfully');
      return res.json(data);
    } catch (error: any) {
      this.logger.error('[realtime] Token error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to create realtime token',
        message: String(error),
      });
    }
  }

  /**
   * POST /api/v1/realtime/session (Legacy - SDP proxy)
   * Backward compatibility için tutuyoruz
   */
  @Post('session')
  async createSession(@Req() req: Request, @Res() res: Response) {
    // Token endpoint'ine yönlendir
    return this.getToken(req, res);
  }

  /**
   * POST /api/v1/realtime/sdp
   * Frontend'den gelen SDP'yi OpenAI'a proxy'ler
   * Güvenlik: API key backend'de kalır, ephemeral key kullanılır
   */
  @Post('sdp')
  @UseGuards(JwtAuthGuard)
  async proxySdp(
    @Body() body: { sdp: string; ephemeralKey: string },
    @Res() res: Response,
  ) {
    try {
      if (!body.sdp || !body.ephemeralKey) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Missing sdp or ephemeralKey',
        });
      }

      this.logger.debug('Proxying SDP to OpenAI Realtime API...');

      const response = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${body.ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: body.sdp,
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`OpenAI SDP error: ${response.status} - ${errText}`);
        return res.status(response.status).json({
          error: `OpenAI SDP error: ${response.status}`,
          details: errText,
        });
      }

      const answerSdp = await response.text();
      this.logger.debug('SDP proxy successful');
      
      return res.json({ sdp: answerSdp });
    } catch (error: any) {
      this.logger.error('SDP proxy error:', error.message);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'SDP proxy failed',
        message: error.message,
      });
    }
  }
}
