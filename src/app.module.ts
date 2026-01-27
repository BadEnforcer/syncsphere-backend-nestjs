import { Module } from '@nestjs/common';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from '@nestjs/cache-manager';
import { GroupModule } from './group/group.module';
import { UserModule } from './user/user.module';
import { ConversationModule } from './conversation/conversation.module';
import { ZodValidationPipe, ZodSerializerInterceptor } from 'nestjs-zod';
import { ChatGateway } from './chat/chat.gateway';
import { PresenceService } from './chat/presence/presence.service';
import { MediaModule } from './media/media.module';
import { FirebaseModule } from 'nestjs-firebase';
import { FirebaseModule as AppFirebaseModule } from './firebase/firebase.module';
import * as firebaseServiceAccount from './firebase.json';
import * as admin from 'firebase-admin';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // BullMQ configuration for job queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.getOrThrow<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
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
    ConversationModule,
    MediaModule,
    FirebaseModule.forRoot({
      googleApplicationCredential:
        firebaseServiceAccount as admin.ServiceAccount,
    }),
    AppFirebaseModule,
    EventEmitterModule.forRoot(),
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
