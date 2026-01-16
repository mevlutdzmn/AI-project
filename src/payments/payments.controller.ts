import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response, Request } from 'express';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PaymentsService } from './payments.service';
import { ZarinpalAdapter } from './zarinpal.adapter';
import { EmailService } from '../notifications/email.service';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/drizzle.provider';
import { users, pending_users } from '../database/schema';
import { AuthenticatedRequest } from '../common/types';
import * as schema from '../database/schema';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    private zarinpalService: ZarinpalAdapter,
    private mailService: EmailService,
    private configService: ConfigService,
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {}

  @Post('create-intent')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe payment intent' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  async createPaymentIntent(@Req() req: AuthenticatedRequest, @Body() body: { amount?: number }) {
    return this.paymentsService.createPaymentIntent(
      req.user.id,
      req.user.email,
      body.amount,
    );
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook handler' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Missing stripe-signature');
    }

    try {
      await this.paymentsService.handleWebhook(
        signature as string,
        (req as any).rawBody || req.body,
      );
      return res.send({ received: true });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Webhook Error: ${errorMessage}`);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook Error: ${errorMessage}`);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check user subscription status' })
  @ApiResponse({ status: 200, description: 'Returns subscription status' })
  async getStatus(@Req() req: AuthenticatedRequest) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, req.user.id),
      columns: {
        isPremium: true,
        subscriptionExpiresAt: true,
        active: true,
      },
    });

    if (!user) {
      return { active: false, daysRemaining: 0 };
    }

    const now = new Date();
    const expiresAt = user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt)
      : null;
    const isActive = user.isPremium && expiresAt && expiresAt > now;
    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

    return {
      active: isActive,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      daysRemaining,
      plan: 'monthly',
      amount: 199000,
    };
  }

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate Zarinpal payment' })
  @ApiResponse({ status: 201, description: 'Payment initiated' })
  async initiatePayment(
    @Body() body: { userId: number; email: string; plan?: string },
  ) {
    const { userId, email, plan = 'monthly' } = body;
    const amount = 199000;

    const payment = await this.zarinpalService.initiatePayment(
      amount,
      email,
      `Gooai Monthly Subscription - ${email}`,
      { userId: userId.toString(), plan },
    );

    return {
      status: 'pending-payment',
      paymentUrl: payment.paymentUrl,
      authority: payment.authority,
      amount,
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Zarinpal payment callback' })
  @ApiQuery({ name: 'Authority', description: 'Payment authority' })
  @ApiQuery({ name: 'Status', description: 'Payment status' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend' })
  async callback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Res() res: Response,
  ) {
    const FRONTEND_URL =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    try {
      if (status !== 'OK') {
        this.logger.warn(
          `Payment failed or canceled. Authority: ${authority}, Status: ${status}`,
        );
        return res.redirect(`${FRONTEND_URL}/payment/failed?reason=canceled`);
      }

      const amount = 199000;
      const verification = await this.zarinpalService.verifyPayment(
        authority,
        amount,
      );

      if (!verification.success) {
        this.logger.error(
          `Payment verification failed: ${verification.message}`,
        );
        return res.redirect(
          `${FRONTEND_URL}/payment/failed?reason=verification_failed`,
        );
      }

      return res.redirect(
        `${FRONTEND_URL}/payment/success?authority=${authority}&refId=${verification.refId}`,
      );
    } catch (error: unknown) {
      this.logger.error('Payment callback error:', error);
      return res.redirect(`${FRONTEND_URL}/payment/failed?reason=server_error`);
    }
  }

  @Post('activate')
  @ApiOperation({ summary: 'Activate account after payment' })
  @ApiResponse({ status: 200, description: 'Account activated' })
  @ApiResponse({ status: 400, description: 'Payment not verified' })
  async activateAccount(
    @Body() body: { authority: string; email: string; password?: string },
    @Res() res: Response,
  ) {
    try {
      const { authority, email } = body;
      this.logger.log('🔐 Activating account:', { authority, email });

      const amount = 199000;
      const verification = await this.zarinpalService.verifyPayment(
        authority,
        amount,
      );

      if (!verification.success) {
        this.logger.error(
          `Payment verification failed: ${verification.message}`,
        );
        return res.status(HttpStatus.BAD_REQUEST).send({
          error: 'PAYMENT_NOT_VERIFIED',
          message: 'Ödeme doğrulanamadı',
        });
      }

      this.logger.log('✅ Payment verified:', {
        authority,
        refId: verification.refId,
      });

      const [existingUser] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (existingUser) {
        const subscriptionExpiresAt = new Date();
        subscriptionExpiresAt.setDate(subscriptionExpiresAt.getDate() + 30);

        await this.db
          .update(users)
          .set({
            active: true,
            subscriptionExpiresAt,
            verified: true,
            isPremium: true,
          })
          .where(eq(users.email, email));

        this.logger.log(
          `✅ Existing user ${email} reactivated. Expires at: ${subscriptionExpiresAt}`,
        );

        return res.send({
          success: true,
          message: 'Account reactivated successfully',
          expiresAt: subscriptionExpiresAt,
          userId: existingUser.id,
        });
      }

      const [pendingUser] = await this.db
        .select()
        .from(pending_users)
        .where(eq(pending_users.email, email));

      if (!pendingUser) {
        this.logger.error('No pending user found:', email);
        return res
          .status(HttpStatus.NOT_FOUND)
          .send({ error: 'Pending user not found' });
      }

      if (!pendingUser.verified) {
        this.logger.error('Pending user email not verified:', email);
        return res
          .status(HttpStatus.BAD_REQUEST)
          .send({ error: 'Email not verified' });
      }

      const subscriptionExpiresAt = new Date();
      subscriptionExpiresAt.setDate(subscriptionExpiresAt.getDate() + 30);

      const [newUser] = await this.db
        .insert(users)
        .values({
          email,
          password: pendingUser.password,
          verified: true,
          verificationCode: null,
          verificationExpires: null,
          active: true,
          subscriptionExpiresAt,
          isPremium: true,
        })
        .returning({ id: users.id, email: users.email });

      await this.db.delete(pending_users).where(eq(pending_users.email, email));

      this.logger.log('✅ NEW USER CREATED after payment:', {
        userId: newUser.id,
        email,
        subscriptionExpiresAt,
      });

      try {
        await this.mailService.sendWelcomeEmail(email);
        this.logger.log('📧 Welcome email sent to:', email);
      } catch (emailError) {
        this.logger.error('❌ Failed to send welcome email:', emailError);
      }

      return res.send({
        success: true,
        message: 'Account created and activated successfully',
        expiresAt: subscriptionExpiresAt,
        userId: newUser.id,
      });
    } catch (error: unknown) {
      this.logger.error('❌ Activation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ error: errorMessage });
    }
  }

  @Post('continue')
  @ApiOperation({ summary: 'Continue incomplete payment' })
  @ApiResponse({ status: 201, description: 'Payment resumed' })
  async continuePayment(@Body() body: { email: string }) {
    const { email } = body;
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user) throw new Error('User not found');
    if (user.active) throw new Error('Account is already active');

    const amount = 199000;
    const payment = await this.zarinpalService.initiatePayment(
      amount,
      email,
      `Gooai Monthly Subscription - Continue Payment`,
      { userId: user.id.toString(), plan: 'monthly' },
    );

    return {
      status: 'pending-payment',
      paymentUrl: payment.paymentUrl,
      authority: payment.authority,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('renew')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renew subscription' })
  @ApiResponse({ status: 201, description: 'Renewal initiated' })
  async renewSubscription(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) throw new Error('User not found');

    const amount = 199000;
    const payment = await this.zarinpalService.initiatePayment(
      amount,
      user.email,
      `Gooai Subscription Renewal - ${user.email}`,
      { userId: userId.toString(), plan: 'monthly', type: 'renewal' },
    );

    return {
      status: 'pending-payment',
      paymentUrl: payment.paymentUrl,
      authority: payment.authority,
    };
  }
}
