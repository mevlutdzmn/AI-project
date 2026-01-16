import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Request,
  UseGuards,
  Req,
  Res,
  Headers,
  Ip,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../common/types';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendCodeDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import type { Response } from 'express';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.login(body.email, body.password, userAgent, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.refreshAccessToken(refreshToken, userAgent, ip);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearerAuth')
  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(
    @Request() req: AuthenticatedRequest,
    @Body('refreshToken') refreshToken?: string,
  ) {
    await this.authService.logout(req.user.id, refreshToken);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearerAuth')
  @Get('sessions')
  @ApiOperation({ summary: 'Get active sessions' })
  @ApiResponse({ status: 200, description: 'Active sessions list' })
  async getActiveSessions(@Request() req: AuthenticatedRequest) {
    return this.authService.getActiveSessions(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearerAuth')
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  async revokeSession(
    @Request() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeSession(req.user.id, parseInt(sessionId, 10));
    return { success: true };
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset email sent if user exists' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email, body.locale);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with code' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  async verifyEmail(@Body() body: VerifyEmailDto) {
    try {
      return await this.authService.verifyEmail(body.email, body.code);
    } catch (error) {
      console.error('Verify email error:', error);
      throw error;
    }
  }

  @Post('resend-code')
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiResponse({ status: 200, description: 'Code sent' })
  async resendCode(@Body() body: ResendCodeDto) {
    return this.authService.resendVerificationCode(body.email);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('bearerAuth')
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  getProfile(@Request() req: AuthenticatedRequest) {
    // ✅ Hassas bilgileri çıkar ve isPremium'u düzgün döndür
    const {
      password,
      verificationCode,
      resetToken,
      resetTokenExpiry,
      ...safeUser
    } = req.user as any;
    return {
      ...safeUser,
      isPremium: req.user.isPremium ?? false,
      subscriptionEnd: req.user.subscriptionExpiresAt,
    };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth' })
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthRedirect(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const user = req.user;
    const token = await this.authService.handleGoogleLogin(user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
}
