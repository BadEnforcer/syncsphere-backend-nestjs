import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { PresenceService } from 'src/chat/presence/presence.service';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService, PresenceService],
  exports: [ConversationService],
})
export class ConversationModule {}
