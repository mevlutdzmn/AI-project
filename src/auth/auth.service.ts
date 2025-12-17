import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../notifications/email.service';
import { PasswordHasher } from '../common/utils/password-hasher';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import { pending_users, users } from '../database/schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

const VERIFICATION_WINDOW_MINUTES = 15;

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

  async login(email: string, password: string) {
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

    const payload = {
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    };
    const token = this.jwtService.sign(payload);

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
    };
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
      const randomPassword = Math.random().toString(36).slice(-12);
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
