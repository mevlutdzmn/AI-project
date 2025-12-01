import { Injectable } from '@nestjs/common';

@Injectable()
export class CodeInterpreterTool {
  async run(_: { language: string; code: string }) {
    // Secure sandboxing is out of scope here. Placeholder only.
    return { output: 'Code execution not enabled in this environment.' };
  }
}
