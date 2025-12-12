import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AudioService {
  private client: OpenAI | null;
  private readonly logger = new Logger(AudioService.name);

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('OPENAI_API_KEY');
    if (!key) {
      this.logger.warn('⚠️ OpenAI API key not found for Audio service');
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey: key });
    }
  }

  /**
   * Whisper STT - Ses dosyasını metne çevir
   */
  async transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log(`[Whisper] Transcribing audio: ${filename}, size: ${audioBuffer.length} bytes`);

    try {
      // Create a File-like object from Uint8Array (Buffer compatibility)
      const uint8 = new Uint8Array(audioBuffer);
      const file = new File([uint8], filename, {
        type: this.getMimeType(filename),
      });

      const response = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file: file,
        response_format: 'text',
      });

      this.logger.log(`[Whisper] Transcription complete: "${String(response).substring(0, 100)}..."`);
      return String(response);
    } catch (error: any) {
      this.logger.error(`[Whisper] Transcription failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * OpenAI TTS - Metni sese çevir
   */
  async speakText(
    text: string,
    voice: string = 'alloy',
    model: string = 'tts-1',
  ): Promise<Buffer> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log(`[TTS] Speaking text (${text.length} chars) with voice: ${voice}, model: ${model}`);

    try {
      const response = await this.client.audio.speech.create({
        model: model,
        voice: voice as any,
        input: text,
        response_format: 'mp3',
      });

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(`[TTS] Audio generated: ${buffer.length} bytes`);
      return buffer;
    } catch (error: any) {
      this.logger.error(`[TTS] Speech generation failed: ${error.message}`);
      throw error;
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      webm: 'audio/webm',
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      m4a: 'audio/m4a',
      flac: 'audio/flac',
    };
    return mimeTypes[ext || ''] || 'audio/webm';
  }
}
