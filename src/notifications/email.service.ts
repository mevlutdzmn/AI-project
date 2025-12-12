import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPass = this.configService.get<string>('EMAIL_PASS');

    if (!emailUser || !emailPass) {
      this.logger.warn(
        '⚠️ EMAIL_USER or EMAIL_PASS missing. Email sending will fail.',
      );
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`[DEV] Verification code for ${email}: ${code}`);
      return false;
    }

    const emailUser = this.configService.get<string>('EMAIL_USER');
    await this.transporter.sendMail({
      from: `"AI Platform" <${emailUser}>`,
      to: email,
      subject: 'Your verification code',
      html: this.getVerificationEmailTemplate(code),
    });
    return true;
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`[DEV] Password reset link for ${email}: ${resetLink}`);
      return false;
    }

    const emailUser = this.configService.get<string>('EMAIL_USER');
    await this.transporter.sendMail({
      from: `"AI Platform" <${emailUser}>`,
      to: email,
      subject: 'بازیابی رمز عبور',
      html: this.getPasswordResetEmailTemplate(resetLink),
    });
    return true;
  }

  async sendWelcomeEmail(email: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV] Welcome email would be sent to: ${email}`);
      return;
    }

    const emailUser = this.configService.get<string>('EMAIL_USER');
    await this.transporter.sendMail({
      from: `"Gooai" <${emailUser}>`,
      to: email,
      subject: 'Welcome to Gooai Premium! 🎉',
      html: this.getWelcomeEmailTemplate(),
    });
  }

  private getVerificationEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background-color: #0a0a0a;
              color: #ffffff;
              margin: 0;
              padding: 40px 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              border-radius: 16px;
              padding: 40px;
              border: 1px solid #2a2a3e;
            }
            .logo {
              text-align: center;
              font-size: 32px;
              font-weight: bold;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 30px;
            }
            h1 {
              color: #ffffff;
              font-size: 24px;
              margin-bottom: 20px;
            }
            p {
              color: #b4b4b4;
              font-size: 16px;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .code-box {
              background: #0a0a0a;
              border: 2px solid #667eea;
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 48px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #667eea;
              font-family: 'Courier New', monospace;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #2a2a3e;
            }
            .warning {
              background: #2a1a1a;
              border-left: 4px solid #ff6b6b;
              padding: 15px;
              margin-top: 20px;
              border-radius: 4px;
              font-size: 14px;
              color: #ffcccc;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">AI Platform</div>
            <h1>Verify your email address</h1>
            <p>Welcome! Use the following 6-digit code to activate your account:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p>This code is valid for <strong>15 minutes</strong>.</p>
            <div class="warning">
              <strong>Security warning:</strong> Do not share this code with anyone.
            </div>
            <div class="footer">
              <p>If you did not request this email, you can safely ignore it.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(resetLink: string): string {
    return `
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Tahoma', sans-serif;
              background-color: #0a0a0a;
              color: #ffffff;
              margin: 0;
              padding: 40px 20px;
              direction: rtl;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              border-radius: 16px;
              padding: 40px;
              border: 1px solid #2a2a3e;
            }
            .logo {
              text-align: center;
              font-size: 32px;
              font-weight: bold;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 30px;
            }
            h1 {
              color: #ffffff;
              font-size: 24px;
              margin-bottom: 20px;
              text-align: center;
            }
            p {
              color: #b4b4b4;
              font-size: 16px;
              line-height: 1.8;
              margin-bottom: 20px;
              text-align: center;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .reset-button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #ffffff !important;
              text-decoration: none;
              padding: 15px 40px;
              border-radius: 12px;
              font-size: 18px;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #2a2a3e;
            }
            .warning {
              background: #2a1a1a;
              border-right: 4px solid #ff6b6b;
              padding: 15px;
              margin-top: 20px;
              border-radius: 4px;
              font-size: 14px;
              color: #ffcccc;
              text-align: right;
            }
            .expire-note {
              background: #1a2a1a;
              border-right: 4px solid #4CAF50;
              padding: 15px;
              margin-top: 20px;
              border-radius: 4px;
              font-size: 14px;
              color: #a5d6a7;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">AI Platform</div>
            <h1>بازیابی رمز عبور</h1>
            <p>درخواست بازیابی رمز عبور برای حساب شما دریافت شد.</p>
            <p>برای تغییر رمز عبور خود، روی دکمه زیر کلیک کنید:</p>
            <div class="button-container">
              <a href="${resetLink}" class="reset-button">تغییر رمز عبور</a>
            </div>
            <div class="expire-note">
              این لینک تا <strong>۱ ساعت</strong> معتبر است.
            </div>
            <div class="warning">
              <strong>هشدار امنیتی:</strong> اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.
            </div>
            <div class="footer">
              <p>در صورت بروز مشکل، با پشتیبانی تماس بگیرید.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getWelcomeEmailTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background-color: #0a0a0a;
              color: #ffffff;
              margin: 0;
              padding: 40px 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              border-radius: 16px;
              padding: 40px;
              border: 1px solid #2a2a3e;
            }
            .logo {
              text-align: center;
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 {
              color: #ffffff;
              font-size: 28px;
              margin-bottom: 20px;
              text-align: center;
            }
            p {
              color: #b4b4b4;
              font-size: 16px;
              line-height: 1.6;
              margin-bottom: 20px;
            }
            .success-box {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 10px;
            }
            .success-text {
              color: #ffffff;
              font-size: 20px;
              font-weight: bold;
            }
            .features {
              background: #0a0a0a;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
            }
            .feature {
              margin: 15px 0;
              color: #ffffff;
            }
            .feature-icon {
              color: #667eea;
              margin-right: 10px;
            }
            .cta-button {
              display: block;
              width: 100%;
              padding: 15px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #ffffff;
              text-align: center;
              text-decoration: none;
              border-radius: 8px;
              font-size: 18px;
              font-weight: bold;
              margin: 30px 0;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #2a2a3e;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">🚀</div>
            <h1>Welcome to Gooai Premium!</h1>
            
            <div class="success-box">
              <div class="success-icon">✅</div>
              <div class="success-text">Payment Successful - Account Activated!</div>
            </div>

            <p>Congratulations! Your Gooai Premium subscription is now active. You have full access to all premium features:</p>

            <div class="features">
              <div class="feature">
                <span class="feature-icon">🤖</span>
                <strong>GPT-4 & Claude 3.5 Sonnet</strong> - Advanced AI models
              </div>
              <div class="feature">
                <span class="feature-icon">🎨</span>
                <strong>DALL-E Image Generation</strong> - Create stunning visuals
              </div>
              <div class="feature">
                <span class="feature-icon">🔍</span>
                <strong>Web Search Integration</strong> - Real-time information
              </div>
              <div class="feature">
                <span class="feature-icon">📁</span>
                <strong>File Upload & Analysis</strong> - Work with documents
              </div>
              <div class="feature">
                <span class="feature-icon">💬</span>
                <strong>Unlimited Conversations</strong> - No restrictions
              </div>
            </div>

            <a href="http://localhost:3000/chat" class="cta-button">
              Start Chatting Now →
            </a>

            <p style="text-align: center; color: #888;">
              Your subscription is valid for 30 days from today.
            </p>

            <div class="footer">
              <p>Thank you for choosing Gooai! 🎉</p>
              <p>If you have any questions, feel free to reach out to our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
