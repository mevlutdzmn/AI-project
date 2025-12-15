import { Controller, Post, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);
  constructor(private configService: ConfigService) {}

  /**
   * POST /api/v1/realtime/session
   * OpenAI Realtime API için session oluşturur
   * OPENAI_API_KEY backend'de saklanıyor
   */
  @Post('session')
  async createSession(@Req() req: Request, @Res() res: Response) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.error('Missing OPENAI_API_KEY');
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
        error: 'Missing server OPENAI_API_KEY' 
      });
    }

    try {
      const contentType = req.headers['content-type'] || 'application/json';
      let bodyText: string;
      
      if (typeof req.body === 'string') {
        bodyText = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        bodyText = req.body.toString('utf8');
      } else {
        bodyText = JSON.stringify(req.body);
      }

      this.logger.debug(`Creating session, body_len: ${bodyText.length}`);

      // ✅ WebRTC için doğru endpoint
      const openaiUrl = 'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
      
      // SDP'yi parse et
      let sdp: string;
      try {
        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(bodyText);
          sdp = parsed.sdp || bodyText;
        } else {
          sdp = bodyText;
        }
      } catch {
        sdp = bodyText;
      }

      this.logger.debug('Sending SDP to OpenAI...');

      // ✅ WebRTC SDP negotiation - application/sdp formatında gönder
      const response = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/sdp',
        },
        body: sdp,
      });

      const respText = await response.text();
      this.logger.debug(`OpenAI response status: ${response.status}`);
      if (response.status !== 200 && response.status !== 201) {
        this.logger.warn(`OpenAI error response: ${respText.substring(0, 500)}`);
      }

      // Headers'ı kopyala
      const location = response.headers.get('location');
      if (location) {
        res.setHeader('location', location);
      }

      const respContentType = response.headers.get('content-type');
      if (respContentType) {
        res.setHeader('content-type', respContentType);
      }

      return res.status(response.status).send(respText);
    } catch (error: any) {
      console.error('[realtime] Error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to create realtime session',
        message: String(error),
      });
    }
  }
}
