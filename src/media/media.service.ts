import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { R2Service } from './r2/r2.service';
import { v7 } from 'uuid';
import { type UserSession } from '@thallesp/nestjs-better-auth';
import * as MediaDto from './media.dto';
import { MediaStatus } from '@prisma/client';

// Auto-deletion window for PENDING uploads (24 hours in milliseconds)
const AUTO_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
  ) {}

  /**
   * Requests an upload URL for a new file.
   * Creates a PENDING media record and generates a presigned URL for direct upload.
   * The upload must be confirmed within 24 hours or the file will be auto-deleted.
   */
  async requestUpload(
    input: MediaDto.RequestUploadInput,
    session: UserSession,
  ): Promise<MediaDto.RequestUploadResponseDto> {
    try {
      const userId = session.user.id;
      const mediaId = v7();
      const expiresAt = new Date(Date.now() + AUTO_DELETE_WINDOW_MS);

      // Generate R2 object key
      const key = this.r2Service.generateMediaKey(
        userId,
        mediaId,
        input.filename,
      );

      // Generate presigned upload URL
      const uploadUrl = await this.r2Service.generateUploadUrl(
        key,
        input.mimeType,
      );

      // Get public URL for access after upload
      const publicUrl = this.r2Service.getPublicUrl(key);

      // Create media record in PENDING status
      await this.prisma.media.create({
        data: {
          id: mediaId,
          key: key,
          filename: input.filename,
          mimeType: input.mimeType,
          size: input.size,
          uploaderId: userId,
          status: MediaStatus.PENDING,
          expiresAt: expiresAt,
        },
      });

      this.logger.log(`Created PENDING media ${mediaId} for user ${userId}`);

      return {
        mediaId,
        uploadUrl,
        publicUrl,
        expiresAt,
      };
    } catch (error) {
      this.logger.error('Failed to request upload due to an error');
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Confirms that a file has been uploaded successfully.
   * Updates the media status from PENDING to CONFIRMED.
   * This operation is idempotent - confirming an already confirmed upload returns success.
   */
  async confirmUpload(
    mediaId: string,
    input: MediaDto.ConfirmUploadInput,
    session: UserSession,
  ): Promise<MediaDto.ConfirmUploadResponseDto> {
    try {
      const userId = session.user.id;

      // Find the media record
      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });

      if (!media) {
        this.logger.warn(`Media ${mediaId} not found`);
        throw new NotFoundException('Media not found');
      }

      // Check ownership
      if (media.uploaderId !== userId) {
        this.logger.warn(
          `User ${userId} attempted to confirm media ${mediaId} owned by ${media.uploaderId}`,
        );
        throw new ForbiddenException('Not authorized to confirm this upload');
      }

      // Idempotent: already confirmed
      if (media.status === MediaStatus.CONFIRMED) {
        this.logger.debug(`Media ${mediaId} is already confirmed`);
        return {
          success: true,
          mediaId: media.id,
          publicUrl: this.r2Service.getPublicUrl(media.key),
        };
      }

      // Check if upload has expired
      if (media.expiresAt < new Date()) {
        this.logger.warn(`Media ${mediaId} has expired`);
        throw new BadRequestException(
          'Upload has expired. Please request a new upload URL.',
        );
      }

      // Update status to CONFIRMED
      const updatedMedia = await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          status: MediaStatus.CONFIRMED,
          confirmedAt: new Date(),
          size: input.size ?? media.size,
        },
      });

      this.logger.log(`Confirmed media ${mediaId} for user ${userId}`);

      return {
        success: true,
        mediaId: updatedMedia.id,
        publicUrl: this.r2Service.getPublicUrl(updatedMedia.key),
      };
    } catch (error) {
      this.logger.error(`Failed to confirm upload ${mediaId} due to an error`);
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Retrieves media details by ID.
   * Any authenticated user can access media metadata since media is shared via public URLs in chat.
   */
  async getMedia(
    mediaId: string,
    session: UserSession,
  ): Promise<MediaDto.MediaResponseDto> {
    try {
      const userId = session.user.id;
      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException('Media not found');
      }

      // No ownership check - media is publicly accessible via URLs in chat
      this.logger.debug(`User ${userId} accessed media ${mediaId}`);
      return {
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        size: media.size,
        publicUrl: this.r2Service.getPublicUrl(media.key),
        status: media.status,
        createdAt: media.createdAt,
        confirmedAt: media.confirmedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get media ${mediaId} due to an error`);
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Deletes a media record and its associated file in R2.
   * Only the uploader can delete their own media.
   */
  async deleteMedia(mediaId: string, session: UserSession): Promise<boolean> {
    try {
      const userId = session.user.id;

      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException('Media not found');
      }

      // Check ownership
      if (media.uploaderId !== userId) {
        throw new ForbiddenException('Not authorized to delete this media');
      }

      // Delete from R2 first
      await this.r2Service.deleteObject(media.key);

      // Delete from database
      await this.prisma.media.delete({
        where: { id: mediaId },
      });

      this.logger.log(`Deleted media ${mediaId} by user ${userId}`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete media ${mediaId} due to an error`);
      this.logger.error(error);
      throw error;
    }
  }
}
