import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DalleAdapter } from '../adapters/dalle.adapter';
import { UsersService } from '../../users/users.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('image')
export class ImageController {
  constructor(
    private dalleAdapter: DalleAdapter,
    private userService: UsersService,
  ) {}

  @Post('generate')
  @UseGuards(AuthGuard('jwt'))
  async generateImage(@Req() req, @Body() body: { prompt: string }) {
    const { prompt } = body;
    const userId = req.user.id;

    if (!prompt || prompt.trim().length === 0) {
      throw new HttpException('Prompt is required', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }

    const imageCredits = user.imageCredits ?? 0;
    const isFreeUser = !user.isPremium && !user.isAdmin;

    let premiumExpired = false;
    if (user.isPremium && user.subscriptionExpiresAt) {
      premiumExpired = new Date() > new Date(user.subscriptionExpiresAt);
    }

    if ((isFreeUser || premiumExpired) && imageCredits >= 1) {
      throw new HttpException(
        {
          error: 'Image limit reached',
          message:
            'حساب رایگان فقط ۱ تصویر می‌تواند بسازد. برای تصاویر بیشتر به پریمیوم ارتقا دهید.',
          upgradeRequired: true,
          limit: 1,
          used: imageCredits,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const result = await this.dalleAdapter.generateImageFull(prompt);
      await this.userService.incrementImageCredits(userId);

      return {
        success: true,
        imageUrl: result.url,
        enhancedPrompt: result.enhancedPrompt,
        styleUsed: result.styleUsed,
        prompt,
        creditsUsed: imageCredits + 1,
        isPremium: user.isPremium && !premiumExpired,
      };
    } catch (error: unknown) {
      throw new HttpException(error instanceof Error ? error.message : 'Unknown error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
