import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID,
  zarinpalCallbackUrl: process.env.ZARINPAL_CALLBACK_URL,
  zarinpalSandbox: process.env.ZARINPAL_SANDBOX === 'true',
}));
