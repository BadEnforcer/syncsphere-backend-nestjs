import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiParam,
  ApiOperation,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import * as MediaDto from './media.dto';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

/**
 * Controller for media upload and management operations.
 * Implements presigned URL upload flow with auto-deletion safety net.
 * All endpoints require authentication.
 */
@ApiTags('Media')
@ApiCookieAuth('better-auth.session_token')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Requests a presigned URL for uploading a file.
   * Creates a PENDING media record that will be auto-deleted after 24h if not confirmed.
   */
  @Post('/request-upload')
  @ApiOperation({ summary: 'Get presigned URL for file upload' })
  async requestUpload(
    @Body() input: MediaDto.RequestUploadDto,
    @Session() session: UserSession,
  ): Promise<MediaDto.RequestUploadResponseDto> {
    return this.mediaService.requestUpload(input, session);
  }

  /**
   * Confirms that a file has been successfully uploaded.
   * Updates the media status from PENDING to CONFIRMED.
   */
  @Post('/:mediaId/confirm')
  @ApiOperation({ summary: 'Confirm file upload completion' })
  @ApiParam({ name: 'mediaId', description: 'ID of the media to confirm' })
  async confirmUpload(
    @Param('mediaId') mediaId: string,
    @Body() input: MediaDto.ConfirmUploadDto,
    @Session() session: UserSession,
  ): Promise<MediaDto.ConfirmUploadResponseDto> {
    return this.mediaService.confirmUpload(mediaId, input, session);
  }

  /**
   * Retrieves details of a specific media item.
   * Any authenticated user can access media metadata.
   */
  @Get('/:mediaId')
  @ApiOperation({ summary: 'Get media details' })
  @ApiParam({ name: 'mediaId', description: 'ID of the media to retrieve' })
  async getMedia(
    @Param('mediaId') mediaId: string,
    @Session() session: UserSession,
  ): Promise<MediaDto.MediaResponseDto> {
    return this.mediaService.getMedia(mediaId, session);
  }

  /**
   * Deletes a media item and its associated file in R2.
   * Only the uploader can delete their own media.
   */
  @Delete('/:mediaId')
  @ApiOperation({ summary: 'Delete media' })
  @ApiParam({ name: 'mediaId', description: 'ID of the media to delete' })
  async deleteMedia(
    @Param('mediaId') mediaId: string,
    @Session() session: UserSession,
  ): Promise<{ success: boolean }> {
    const result = await this.mediaService.deleteMedia(mediaId, session);
    return { success: result };
  }
}
