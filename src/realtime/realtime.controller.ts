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
      
      // Session configuration - çok dilli destek
      const sessionConfig = {
        type: "realtime",
        model: "gpt-4o-realtime-preview",
        instructions: `You are a multilingual voice assistant. Your PRIMARY RULE is to ALWAYS respond in the EXACT SAME LANGUAGE the user speaks.

LANGUAGE MATCHING - THIS IS YOUR MOST IMPORTANT RULE:
1. Listen carefully to the user's language
2. Identify the language they are speaking
3. Respond ONLY in that SAME language
4. NEVER switch to a different language

LANGUAGE EXAMPLES:
- If user speaks PERSIAN/FARSI (سلام، خوبی، چطوری) → respond in PERSIAN
- If user speaks TURKISH (Merhaba, Selam, Nasılsın) → respond in TURKISH
- If user speaks ENGLISH (Hello, Hi, How are you) → respond in ENGLISH
- If user speaks ARABIC (مرحبا، كيف حالك) → respond in ARABIC
- If user speaks GERMAN (Hallo, Guten Tag) → respond in GERMAN
- If user speaks FRENCH (Bonjour, Salut) → respond in FRENCH

RULES:
1. Keep responses short (1-2 sentences)
2. Be natural and friendly
3. NEVER default to any specific language - MATCH THE USER'S LANGUAGE`,
        audio: {
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
