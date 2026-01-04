import { Module } from '@nestjs/common';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from '@nestjs/cache-manager';
import { GroupModule } from './group/group.module';
import { UserModule } from './user/user.module';
import { ZodValidationPipe, ZodSerializerInterceptor } from 'nestjs-zod';
import { ChatGateway } from './chat/chat.gateway';
import { PresenceService } from './chat/presence/presence.service';
import { R2Module } from './media/r2';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule.forRoot({ auth, disableGlobalAuthGuard: false }),
    CacheModule.register({
      isGlobal: true,
      ttl: 5000, // ms
    }),
    RedisModule,
    PrismaModule,
    GroupModule,
    UserModule,
    R2Module,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    ChatGateway,
    PresenceService,
  ],
})
export class AppModule {}
