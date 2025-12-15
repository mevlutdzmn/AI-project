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

      const openaiUrl = 'https://api.openai.com/v1/realtime/calls';
      
      // Session configuration - çok dilli destek + transcription
      const sessionConfig = {
        type: "realtime",
        model: "gpt-4o-realtime-preview",
        instructions: `You are a multilingual voice assistant. CRITICAL RULES:
1. ALWAYS respond in the EXACT SAME LANGUAGE the user speaks
2. Turkish (Merhaba, Nasılsın) → respond in Turkish
3. Persian/Farsi (سلام، چطوری) → respond in Persian  
4. English (Hello, Hi) → respond in English
5. Keep responses SHORT (1-2 sentences max)
6. Be friendly and conversational
7. NEVER switch languages - match the user's language exactly`,
        // ✅ Yeni API formatı - audio içinde transcription ve turn_detection
        audio: {
          input: {
            // ✅ Transcription - kullanıcının söylediklerini yazıya dök
            transcription: {
              model: "whisper-1"
            },
            // ✅ Turn detection - konuşma algılama (server VAD)
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          },
          output: {
            voice: "alloy"
          }
        }
      };

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

      // Multipart form-data oluştur (manuel)
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      
      let formBody = '';
      formBody += `--${boundary}\r\n`;
      formBody += `Content-Disposition: form-data; name="sdp"\r\n\r\n`;
      formBody += `${sdp}\r\n`;
      formBody += `--${boundary}\r\n`;
      formBody += `Content-Disposition: form-data; name="session"\r\n\r\n`;
      formBody += `${JSON.stringify(sessionConfig)}\r\n`;
      formBody += `--${boundary}--\r\n`;

      this.logger.debug('Sending to OpenAI...');

      const response = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formBody,
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
