import { Module } from '@nestjs/common';
import { CloudMessagingService } from './cloud-messaging.service';

@Module({
  providers: [CloudMessagingService],
  exports: [CloudMessagingService],
})
export class FirebaseModule {}
