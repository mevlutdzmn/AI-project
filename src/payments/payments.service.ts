import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { users, payments } from '../database/schema';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (apiKey) {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
      });
    } else {
      this.logger.warn(
        '⚠️ STRIPE_SECRET_KEY is missing. Payment features will be disabled.',
      );
      this.stripe = new Stripe('dummy_key', {
        apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
      });
    }
  }

  async checkPremiumStatus(userId: number): Promise<boolean> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    return user?.isPremium || false;
  }

  async createPaymentIntent(
    userId: number,
    email: string,
    amount: number = 2000,
  ) {
    // Create payment record first to get ID
    const [payment] = await this.db
      .insert(payments)
      .values({
        userId,
        amount,
        status: 'pending',
      })
      .returning();

    // Create Stripe payment intent with payment ID in metadata
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        userId: userId.toString(),
        email,
        paymentId: payment.id.toString(),
      },
      automatic_payment_methods: { enabled: true },
    });

    return { clientSecret: paymentIntent.client_secret };
  }

  async handleWebhook(signature: string, payload: Buffer) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '',
      );
    } catch (err: any) {
      throw new Error(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      if (paymentIntent.metadata.userId) {
        const userId = parseInt(paymentIntent.metadata.userId);
        const paymentId = paymentIntent.metadata.paymentId
          ? parseInt(paymentIntent.metadata.paymentId)
          : null;

        if (paymentId) {
          await this.db
            .update(payments)
            .set({ status: 'succeeded' })
            .where(eq(payments.id, paymentId));
        }

        await this.db
          .update(users)
          .set({ isPremium: true })
          .where(eq(users.id, userId));
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const paymentId = paymentIntent.metadata.paymentId
        ? parseInt(paymentIntent.metadata.paymentId)
        : null;

      if (paymentId) {
        await this.db
          .update(payments)
          .set({ status: 'failed' })
          .where(eq(payments.id, paymentId));
      }
    }

    return { received: true };
  }
}
