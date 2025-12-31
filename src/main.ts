import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/adapter/adapter.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // cors
  app.enableCors({origin: '*'})

  // Use Redis Adapter for Socket.io
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
