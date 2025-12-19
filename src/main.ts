import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw } from 'express';
import * as express from 'express';
import { join } from 'path';
import helmet from 'helmet';
import * as compression from 'compression';
import * as Sentry from '@sentry/node';
import { SanitizationInterceptor } from './common/interceptors/sanitization.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

const compress = (compression as any).default || compression;

async function bootstrap() {
  // ✅ Sentry Error Tracking Initialization
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for realtime API SDP handling
  });

  // Security: restrict CORS to known frontend origins and enable credentials
  const allowedOrigins = [
    'http://localhost:3000',
    'https://www.goopay.ai',
    'https://goopay.ai',
    'https://gooai-front.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
  });

  const prefix = 'api/v1';
  app.setGlobalPrefix(prefix);

  // ✅ Performance: Compression (SSE ve webhook hariç)
  app.use(
    compress({
      filter: (req, res) => {
        // SSE stream'leri sıkıştırma
        if (req.headers.accept === 'text/event-stream') {
          return false;
        }
        // Webhook'ları sıkıştırma
        if (req.path.includes('/payments/webhook')) {
          return false;
        }
        return compress.filter(req, res);
      },
      threshold: 1024, // 1KB'den küçük yanıtları sıkıştırma
    }),
  );

  app.use(`/${prefix}/payments/webhook`, raw({ type: 'application/json' }));

  app.use(json({ limit: '10mb' })); // ✅ Security: 50MB'dan 10MB'a düşürüldü

  // ✅ Security: Helmet with basic CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Dev için gevşek
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:', 'wss:'],
          fontSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", 'blob:'],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // OpenAI API ile uyumluluk
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Serve static files for local development only
  if (!process.env.VERCEL) {
    app.use(
      '/uploads',
      express.static(join(process.cwd(), 'uploads'), {
        maxAge: '1d', // ✅ Performance: Static dosyalar için cache
        etag: true,
      }),
    );
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // ✅ Global Interceptors & Filters
  app.useGlobalInterceptors(new SanitizationInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('GooAI Platform API')
    .setDescription(`
# GooAI - AI Chat Platform API

## Overview
Complete REST API for the GooAI chat platform with authentication, chat sessions, 
AI model integration, payments, and user management.

## Authentication
All protected endpoints require a JWT token in the Authorization header:
\`Authorization: Bearer <token>\`

## Rate Limits
- **General endpoints**: 100 requests/minute
- **AI chat endpoints**: 30 requests/minute  
- **File uploads**: 10 requests/minute

## Response Format
All responses follow this structure:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
\`\`\`

## Error Handling
Errors return appropriate HTTP status codes with details:
\`\`\`json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
\`\`\`
    `)
    .setVersion('1.0.0')
    .setContact('GooAI Support', 'https://goopay.ai', 'support@goopay.ai')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:4000', 'Local Development')
    .addServer('https://api.goopay.ai', 'Production')
    .addBearerAuth(
      { 
        type: 'http', 
        scheme: 'bearer', 
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /auth/login'
      },
      'bearerAuth',
    )
    .addTag('Authentication', 'User registration, login, and token management')
    .addTag('Chat', 'AI chat sessions and messaging')
    .addTag('Users', 'User profile and settings')
    .addTag('Folders', 'Chat session organization')
    .addTag('Payments', 'Subscription and payment management')
    .addTag('Files', 'File upload and management')
    .addTag('Memory', 'User memories and custom instructions')
    .addTag('Admin', 'Administrative operations')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
