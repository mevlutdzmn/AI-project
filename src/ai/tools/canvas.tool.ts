import { Injectable } from '@nestjs/common';

@Injectable()
export class CanvasTool {
  async run(_: { instruction: string }) {
    // Placeholder for canvas operations (e.g., edit images/canvas)
    return { status: 'not-implemented' };
  }
}
