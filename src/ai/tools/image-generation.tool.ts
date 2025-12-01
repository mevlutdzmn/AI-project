import { Injectable } from '@nestjs/common';
import { DalleAdapter } from '../adapters/dalle.adapter';

@Injectable()
export class ImageGenerationTool {
  constructor(private readonly dalle: DalleAdapter) {}

  async run(prompt: string, size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024') {
    return this.dalle.generateImage(prompt, size);
  }
}
