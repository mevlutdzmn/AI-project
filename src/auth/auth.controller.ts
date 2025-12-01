import {
    Body,
    Controller,
    Get,
    Post,
    Request,
    UseGuards,
    Req,
    Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { RegisterDto, LoginDto, VerifyEmailDto, ResendCodeDto } from './dto';
import type { Response } from 'express';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register new user' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    async register(@Body() body: RegisterDto) {
        return this.authService.register(body.email, body.password);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login user' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    async login(@Body() body: LoginDto) {
        return this.authService.login(body.email, body.password);
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
    getProfile(@Request() req) {
        return req.user;
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
    async googleAuthRedirect(@Req() req, @Res() res: Response) {
        const user = req.user as any;
        const token = await this.authService.handleGoogleLogin(user);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    }
}
