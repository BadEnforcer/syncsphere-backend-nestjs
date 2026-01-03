import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/adapter/adapter.service';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // cors
  app.enableCors({ origin: '*' });

  // Register Better Auth handler for all auth routes
  const expressApp = app.getHttpAdapter().getInstance();
  const handler = toNodeHandler(auth);
  expressApp.all('/api/auth/*path', (req: Request, res: Response) => {
    return handler(req, res);
  });

  // Use Redis Adapter for Socket.io
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
