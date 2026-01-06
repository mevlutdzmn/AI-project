import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(4000),
  FRONTEND_URL: Joi.string().uri().required(),
  BACKEND_URL: Joi.string().uri().default('http://localhost:4000'),

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Auth
  JWT_SECRET: Joi.string().min(32).required(),

  // OpenAI / Gemini
  OPENAI_API_KEY: Joi.string().allow('', null),
  OPENAI_ORGANIZATION: Joi.string().allow('', null),
  GEMINI_API_KEY: Joi.string().allow('', null),
  OPENAI_RESPONSES_WEB_TOOL: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),

  // Supabase
  SUPABASE_URL: Joi.string().uri().allow('', null),
  SUPABASE_ANON_KEY: Joi.string().allow('', null),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().allow('', null),

  // Payments - Stripe
  STRIPE_SECRET_KEY: Joi.string().allow('', null),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('', null),

  // Payments - Zarinpal
  ZARINPAL_MERCHANT_ID: Joi.string().required(),
  ZARINPAL_SANDBOX: Joi.boolean().truthy('true').falsy('false').default(true),
  ZARINPAL_CALLBACK_URL: Joi.string().uri().required(),

  // Email
  EMAIL_USER: Joi.string().allow('', null),
  EMAIL_PASS: Joi.string().allow('', null),
  RESEND_API_KEY: Joi.string().allow('', null),

  // Search
  TAVILY_API_KEY: Joi.string().allow('', null),
  BING_API_KEY: Joi.string().allow('', null),

  // OAuth
  GOOGLE_CLIENT_ID: Joi.string().allow('', null),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('', null),
});
