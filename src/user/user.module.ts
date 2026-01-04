import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PresenceService } from 'src/chat/presence/presence.service';

@Module({
  controllers: [UserController],
  providers: [UserService, PresenceService],
})
export class UserModule {}
