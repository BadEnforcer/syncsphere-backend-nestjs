import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  MEDIA_CLEANUP_QUEUE,
  CLEANUP_JOB_NAME,
  CLEANUP_CRON,
} from './media-cleanup.constants';

/**
 * Service for managing media cleanup jobs.
 * Registers a repeatable cron job on app startup and provides
 * a method to manually trigger cleanup.
 */
@Injectable()
export class MediaCleanupService implements OnModuleInit {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    @InjectQueue(MEDIA_CLEANUP_QUEUE) private readonly cleanupQueue: Queue,
  ) {}

  /**
   * Called on app startup - registers the repeatable cleanup job.
   * Uses upsertJobScheduler which handles creation/update automatically.
   */
  async onModuleInit(): Promise<void> {
    try {
      // upsertJobScheduler creates or updates a job scheduler
      // This replaces the deprecated getRepeatableJobs/removeRepeatableByKey pattern
      await this.cleanupQueue.upsertJobScheduler(
        CLEANUP_JOB_NAME, // Scheduler ID
        { pattern: CLEANUP_CRON }, // Repeat options
        {
          name: CLEANUP_JOB_NAME,
          data: {}, // No data needed, job queries DB directly
        },
      );

      this.logger.log(`Cleanup job scheduled (cron: ${CLEANUP_CRON})`);
    } catch (error) {
      this.logger.error('Failed to schedule cleanup job due to an error');
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Manually triggers a cleanup run.
   * Useful for testing or admin operations.
   */
  async triggerCleanup(): Promise<void> {
    try {
      await this.cleanupQueue.add(
        CLEANUP_JOB_NAME,
        {},
        { jobId: `manual-cleanup-${Date.now()}` },
      );
      this.logger.log('Manual cleanup job triggered');
    } catch (error) {
      this.logger.error('Failed to trigger manual cleanup due to an error');
      this.logger.error(error);
      throw error;
    }
  }
}
