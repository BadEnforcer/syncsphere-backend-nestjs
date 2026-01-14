import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/adapter/adapter.service';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { Request, Response } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Setup Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SyncSphere API')
    .setDescription('SyncSphere Backend API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs/swagger', app, cleanupOpenApiDoc(document), {
    jsonDocumentUrl: 'docs/swagger/json',
  });

  // cors
  app.enableCors({
    origin: [
      'https://syncsphere-backend-nestjs.vercel.app',
      'https://syncsphere-backend-nestjs-2917555787.asia-south1.run.app', // Cloud Run
      'http://localhost:3000',
      'http://10.0.2.2:3000',
    ],
    credentials: true, // Important for cookies!
  });

  // Register Better Auth handler for all auth routes
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const expressApp = app.getHttpAdapter().getInstance();
  const handler = toNodeHandler(auth);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
  expressApp.all('/api/auth/*path', (req: Request, res: Response) => {
    return handler(req, res);
  });

  // Use Redis Adapter for Socket.io
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Enable graceful shutdown (automatically calls adapter.close() on SIGTERM/SIGINT)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
