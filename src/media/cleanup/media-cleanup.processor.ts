import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { MediaStatus } from '@prisma/client';
import {
  MEDIA_CLEANUP_QUEUE,
  CLEANUP_JOB_NAME,
  CLEANUP_BATCH_SIZE,
} from './media-cleanup.constants';

/**
 * BullMQ processor that handles cleanup of expired PENDING media.
 * Runs on a cron schedule and deletes orphaned files from R2 and DB.
 */
@Processor(MEDIA_CLEANUP_QUEUE)
export class MediaCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
  ) {
    super();
  }

  /**
   * Processes cleanup jobs for expired PENDING media.
   * Queries for records where status=PENDING and expiresAt < now(),
   * then deletes both the R2 object and the database record.
   */
  async process(job: Job): Promise<{ processed: number; failed: number }> {
    // Only handle cleanup-expired job type
    if (job.name !== CLEANUP_JOB_NAME) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return { processed: 0, failed: 0 };
    }

    this.logger.log('Starting cleanup job for expired PENDING media');

    try {
      // Find expired PENDING media records
      const expiredMedia = await this.prisma.media.findMany({
        where: {
          status: MediaStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        take: CLEANUP_BATCH_SIZE,
      });

      if (expiredMedia.length === 0) {
        this.logger.log('No expired PENDING media found');
        return { processed: 0, failed: 0 };
      }

      this.logger.log(
        `Found ${expiredMedia.length} expired PENDING media records`,
      );

      let processedCount = 0;
      let failedCount = 0;

      // Process each expired record
      for (const media of expiredMedia) {
        try {
          // Attempt to delete from R2 first
          // deleteObject returns boolean: true if deleted, false if not found
          const wasDeleted = await this.r2Service.deleteObject(media.key);
          if (wasDeleted) {
            this.logger.debug(`Deleted R2 object: ${media.key}`);
          } else {
            this.logger.debug(
              `R2 object not found (already deleted or never uploaded): ${media.key}`,
            );
          }

          // Delete from database
          await this.prisma.media.delete({
            where: { id: media.id },
          });

          this.logger.debug(`Deleted media ${media.id} from DB`);
          processedCount++;
        } catch (error) {
          this.logger.error(`Failed to cleanup media ${media.id}: ${error}`);
          failedCount++;
        }
      }

      this.logger.log(
        `Cleanup complete: ${processedCount}/${expiredMedia.length} processed, ${failedCount} failed`,
      );

      return { processed: processedCount, failed: failedCount };
    } catch (error) {
      this.logger.error('Failed to run cleanup job due to an error');
      this.logger.error(error);
      throw error;
    }
  }
}
