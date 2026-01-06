import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../notifications/email.service';
import { PasswordHasher } from '../common/utils/password-hasher';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { pending_users, users, authSessions } from '../database/schema';
import { eq, and, gt } from 'drizzle-orm';
import * as crypto from 'crypto';

const VERIFICATION_WINDOW_MINUTES = 15;
const REFRESH_TOKEN_EXPIRY_DAYS = 90;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
    private mailService: EmailService,
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async register(email: string, password: string) {
    // Check if user already exists
    const existing = await this.userService.findByEmail(email);
    if (existing) {
      throw new Error('Email already exists');
    }

    // Check if pending user exists
    const [pendingExists] = await this.db
      .select()
      .from(pending_users)
      .where(eq(pending_users.email, email));

    if (pendingExists) {
      throw new Error('Email already pending verification');
    }

    this.validatePassword(password);

    const hashedPassword = await PasswordHasher.hash(password);
    const verificationCode = this.mailService.generateVerificationCode();
    const verificationExpires = new Date(
      Date.now() + VERIFICATION_WINDOW_MINUTES * 60 * 1000,
    );

    await this.db.insert(pending_users).values({
      email,
      password: hashedPassword,
      verificationCode,
      verificationExpires,
      verified: false,
    });

    try {
      await this.mailService.sendVerificationEmail(email, verificationCode);
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }

    return {
      success: true,
      message: 'Verification code sent. Please check your email.',
    };
  }

  async login(email: string, password: string, deviceInfo?: string, ipAddress?: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await PasswordHasher.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.active) {
      throw new UnauthorizedException('ACCOUNT_NOT_ACTIVE');
    }

    if (
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) < new Date()
    ) {
      await this.db
        .update(users)
        .set({ active: false })
        .where(eq(users.id, user.id));
      throw new UnauthorizedException('SUBSCRIPTION_EXPIRED');
    }

    // ✅ Generate session fingerprint for hijacking prevention
    const fingerprint = this.generateFingerprint(deviceInfo, ipAddress);

    const payload = {
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      fingerprint, // ✅ Add fingerprint to JWT
    };
    const token = this.jwtService.sign(payload);

    // ✅ Generate and store refresh token in database (hashed)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await this.db.insert(authSessions).values({
      userId: user.id,
      refreshToken: hashedRefreshToken,
      deviceInfo: deviceInfo?.substring(0, 512) || 'unknown',
      ipAddress: ipAddress?.substring(0, 45) || 'unknown',
      fingerprint,
      expiresAt,
    });

    this.logger.log(`User ${user.id} logged in from ${ipAddress || 'unknown'}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        verified: user.verified,
        active: user.active,
        isPremium: user.isPremium ?? false,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        subscriptionEnd: user.subscriptionExpiresAt,
        isAdmin: user.isAdmin,
      },
      token,
      refreshToken, // ✅ Return plaintext refresh token to client
    };
  }

  /**
   * Generate a fingerprint from device info and IP for session binding
   */
  private generateFingerprint(deviceInfo?: string, ipAddress?: string): string {
    const data = `${deviceInfo || 'unknown'}:${ipAddress || 'unknown'}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, deviceInfo?: string, ipAddress?: string) {
    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Find valid session
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.refreshToken, hashedToken),
          gt(authSessions.expiresAt, new Date())
        )
      );

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Get user
    const user = await this.userService.findById(session.userId);
    if (!user || !user.active) {
      // Delete invalid session
      await this.db.delete(authSessions).where(eq(authSessions.id, session.id));
      throw new UnauthorizedException('User not found or inactive');
    }

    // ✅ Verify fingerprint matches (optional strict mode)
    const currentFingerprint = this.generateFingerprint(deviceInfo, ipAddress);
    if (session.fingerprint && session.fingerprint !== currentFingerprint) {
      this.logger.warn(`Fingerprint mismatch for user ${user.id}. Possible session hijacking attempt.`);
      // In strict mode, you could reject here. For now, just log.
    }

    // Update last used timestamp
    await this.db
      .update(authSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(authSessions.id, session.id));

    // Generate new access token
    const payload = {
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      fingerprint: currentFingerprint,
    };
    const token = this.jwtService.sign(payload);

    return { token };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await this.db.delete(authSessions).where(
        and(
          eq(authSessions.userId, userId),
          eq(authSessions.refreshToken, hashedToken)
        )
      );
    } else {
      // Logout from all devices
      await this.db.delete(authSessions).where(eq(authSessions.userId, userId));
    }
    this.logger.log(`User ${userId} logged out`);
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: number) {
    return this.db
      .select({
        id: authSessions.id,
        deviceInfo: authSessions.deviceInfo,
        ipAddress: authSessions.ipAddress,
        lastUsedAt: authSessions.lastUsedAt,
        createdAt: authSessions.createdAt,
      })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          gt(authSessions.expiresAt, new Date())
        )
      );
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: number, sessionId: number) {
    await this.db.delete(authSessions).where(
      and(
        eq(authSessions.userId, userId),
        eq(authSessions.id, sessionId)
      )
    );
  }

  async verifyEmail(email: string, code: string) {
    // Check if user already exists in main users table
    const [existingUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (existingUser) {
      // Clean up pending user and return success
      await this.db.delete(pending_users).where(eq(pending_users.email, email));
      throw new Error('Email already verified. Please login.');
    }

    const [pendingUser] = await this.db
      .select()
      .from(pending_users)
      .where(eq(pending_users.email, email));

    if (!pendingUser) {
      throw new Error('User not found');
    }

    if (pendingUser.verified) {
      throw new Error('Email already verified');
    }

    // Normalize codes for comparison (trim whitespace, convert to string)
    const normalizedInputCode = String(code).trim();
    const normalizedStoredCode = String(pendingUser.verificationCode).trim();

    this.logger.debug(
      `Code comparison - input: ${normalizedInputCode}, stored: ${normalizedStoredCode}, match: ${normalizedInputCode === normalizedStoredCode}`,
    );

    if (normalizedStoredCode !== normalizedInputCode) {
      this.logger.warn(
        `Code mismatch! Input: ${normalizedInputCode}, Stored: ${normalizedStoredCode}`,
      );
      throw new Error('Invalid verification code');
    }

    if (
      pendingUser.verificationExpires &&
      new Date() > new Date(pendingUser.verificationExpires)
    ) {
      this.logger.warn('Code expired!');
      throw new Error('Verification code expired');
    }

    this.logger.log('Code validated, creating user...');

    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

    try {
      this.logger.debug('Inserting user into database...');
      const [newUser] = await this.db
        .insert(users)
        .values({
          email: pendingUser.email,
          password: pendingUser.password,
          verified: true,
          verificationCode: null,
          verificationExpires: null,
          active: true,
          isPremium: false,
          subscriptionExpiresAt: subscriptionEnd,
          isAdmin: false,
        })
        .returning();

      this.logger.log(`User created successfully: ${newUser.id}`);

      // Only delete pending user after successful insert
      await this.db.delete(pending_users).where(eq(pending_users.email, email));

      this.logger.debug('Pending user cleaned up');

      // Generate JWT token for immediate login
      const payload = {
        userId: newUser.id,
        email: newUser.email,
        isAdmin: newUser.isAdmin,
      };
      const token = this.jwtService.sign(payload);

      const result = {
        success: true,
        message: 'Email verified successfully. You can now login!',
        email: pendingUser.email,
        user: {
          id: newUser.id,
          email: newUser.email,
          verified: newUser.verified,
          active: newUser.active,
          isPremium: newUser.isPremium ?? false,
          subscriptionExpiresAt: newUser.subscriptionExpiresAt,
          subscriptionEnd: newUser.subscriptionExpiresAt,
          isAdmin: newUser.isAdmin,
        },
        token,
      };

      this.logger.debug('Returning result with token');
      return result;
    } catch (error) {
      this.logger.error('Failed to create user:', error);
      // Don't delete pending user if insert failed
      throw new Error('Failed to create user account. Please try again.');
    }
  }

  async resendVerificationCode(email: string) {
    // Check pending users first
    const [pendingUser] = await this.db
      .select()
      .from(pending_users)
      .where(eq(pending_users.email, email));

    if (!pendingUser) {
      // Check if user already exists and is verified
      const [existingUser] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (existingUser) {
        throw new Error('Email already verified. Please login.');
      }

      throw new Error('User not found. Please register first.');
    }

    if (pendingUser.verified) {
      throw new Error('Email already verified. Please login.');
    }

    const verificationCode = this.mailService.generateVerificationCode();
    const verificationExpires = new Date(
      Date.now() + VERIFICATION_WINDOW_MINUTES * 60 * 1000,
    );

    await this.db
      .update(pending_users)
      .set({ verificationCode, verificationExpires })
      .where(eq(pending_users.email, email));

    await this.mailService.sendVerificationEmail(email, verificationCode);

    return {
      success: true,
      message: 'A new verification code has been sent.',
    };
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error(
        'Password must contain at least one uppercase letter (A-Z)',
      );
    }
    if (!/[a-z]/.test(password)) {
      throw new Error(
        'Password must contain at least one lowercase letter (a-z)',
      );
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number (0-9)');
    }
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`]/.test(password)) {
      throw new Error(
        'Password must contain at least one special character (!@#$%^&*...)',
      );
    }
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message:
          'اگر این ایمیل در سیستم وجود داشته باشد، لینک بازیابی رمز عبور ارسال خواهد شد.',
      };
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save hashed token to database (avoid storing raw token)
    const hashedResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    await this.db
      .update(users)
      .set({
        resetToken: hashedResetToken,
        resetTokenExpiry,
      })
      .where(eq(users.id, user.id));

    // Send reset email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(email, resetLink);

    return {
      success: true,
      message:
        'اگر این ایمیل در سیستم وجود داشته باشد، لینک بازیابی رمز عبور ارسال خواهد شد.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Find user by reset token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.resetToken, hashedToken));

    if (!user) {
      throw new Error('لینک بازیابی نامعتبر یا منقضی شده است.');
    }

    // Check if token is expired
    if (user.resetTokenExpiry && new Date() > new Date(user.resetTokenExpiry)) {
      // Clear expired token
      await this.db
        .update(users)
        .set({ resetToken: null, resetTokenExpiry: null })
        .where(eq(users.id, user.id));
      throw new Error('لینک بازیابی منقضی شده است. لطفاً مجدداً درخواست دهید.');
    }

    // Validate new password
    this.validatePassword(newPassword);

    // Hash new password
    const hashedPassword = await PasswordHasher.hash(newPassword);

    // Update password and clear reset token
    await this.db
      .update(users)
      .set({
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      })
      .where(eq(users.id, user.id));

    return {
      success: true,
      message: 'رمز عبور شما با موفقیت تغییر یافت. اکنون می‌توانید وارد شوید.',
    };
  }

  async handleGoogleLogin(googleUser: any) {
    let user = await this.userService.findByEmail(googleUser.email);
    if (!user) {
      // ✅ Security: Use crypto.randomBytes instead of Math.random for password generation
      const randomPassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
      const hashedPassword = await PasswordHasher.hash(randomPassword);
      const [newUser] = await this.db
        .insert(users)
        .values({
          email: googleUser.email,
          password: hashedPassword,
          verified: true,
          active: true,
          isPremium: false,
          isAdmin: false, // ✅ Yeni kullanıcı için isAdmin set et
        })
        .returning();
      user = newUser;
    }
    // ✅ isAdmin ve isPremium değerlerini boolean olarak garanti et
    const payload = {
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin ?? false,
      isPremium: user.isPremium ?? false,
    };
    return this.jwtService.sign(payload);
  }
}
