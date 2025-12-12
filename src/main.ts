import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw } from 'express';
import * as express from 'express';
import { join } from 'path';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security: restrict CORS to known frontend origin and enable credentials
  const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: [frontendOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length']
  });

  const prefix = 'api/v1';
  app.setGlobalPrefix(prefix);

  app.use(`/${prefix}/payments/webhook`, raw({ type: 'application/json' }));
  app.use(json({ limit: '50mb' }));

  // Security headers via Helmet (CSP disabled for now; can be tuned later)
  app.use(helmet({ contentSecurityPolicy: false }));

  // Serve static files for local development only
  if (!process.env.VERCEL) {
    app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('AI Platform API')
    .setDescription('Chat and tools API documentation')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
