import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule} from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import {auth} from './auth'

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  }),
    AuthModule.forRoot({auth}),
    RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
