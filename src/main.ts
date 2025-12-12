import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw } from 'express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const prefix = 'api/v1';
  app.setGlobalPrefix(prefix);

  app.use(`/${prefix}/payments/webhook`, raw({ type: 'application/json' }));
  app.use(json({ limit: '50mb' }));

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
