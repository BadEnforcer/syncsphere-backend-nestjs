import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaCleanupProcessor } from './media-cleanup.processor';
import { MediaCleanupService } from './media-cleanup.service';
import { MEDIA_CLEANUP_QUEUE } from './media-cleanup.constants';
import { R2Module } from '../r2';

@Module({
  imports: [
    R2Module,
    BullModule.registerQueue({
      name: MEDIA_CLEANUP_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600 }, // Remove completed jobs after 1 hour
        removeOnFail: { age: 86400 }, // Keep failed jobs for 24 hours (debugging)
      },
    }),
  ],
  providers: [MediaCleanupProcessor, MediaCleanupService],
  exports: [MediaCleanupService],
})
export class MediaCleanupModule {}
