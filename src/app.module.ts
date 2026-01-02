import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule} from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import {auth} from './auth'
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationModule } from './organization/organization.module';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  }),
    AuthModule.forRoot({ auth, disableGlobalAuthGuard: true }),
    CacheModule.register({
      isGlobal: true,
      ttl: 5000, // ms
    }),
    RedisModule,
    PrismaModule,
    OrganizationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
