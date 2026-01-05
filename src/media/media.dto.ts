import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// Request Upload - Get presigned URL for uploading
// ============================================================================

/**
 * Schema for requesting an upload URL.
 * Client provides file metadata, server returns presigned upload URL.
 */
export const RequestUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  size: z.number().int().positive().optional(),
});

export class RequestUploadDto extends createZodDto(RequestUploadSchema) {}
export type RequestUploadInput = z.infer<typeof RequestUploadSchema>;

/**
 * Response schema for upload request.
 * Contains presigned URL for direct upload and the public URL for access.
 */
export class RequestUploadResponseDto {
  @ApiProperty({ description: 'Unique media ID' })
  mediaId!: string;

  @ApiProperty({ description: 'Presigned URL for uploading the file via PUT' })
  uploadUrl!: string;

  @ApiProperty({ description: 'Public URL to access the file after upload' })
  publicUrl!: string;

  @ApiProperty({
    description: 'Deadline to complete upload before auto-deletion',
  })
  expiresAt!: Date;
}

// ============================================================================
// Confirm Upload - Mark upload as complete
// ============================================================================

/**
 * Schema for confirming an upload.
 * Optional size can be provided for validation.
 */
export const ConfirmUploadSchema = z.object({
  size: z.number().int().positive().optional(),
});

export class ConfirmUploadDto extends createZodDto(ConfirmUploadSchema) {}
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>;

/**
 * Response for confirm upload operation.
 */
export class ConfirmUploadResponseDto {
  @ApiProperty({ description: 'Whether the confirmation was successful' })
  success!: boolean;

  @ApiProperty({ description: 'The confirmed media ID' })
  mediaId!: string;

  @ApiProperty({ description: 'Public URL to access the file' })
  publicUrl!: string;
}

// ============================================================================
// Media Response - Standard media object
// ============================================================================

/**
 * Standard media response object.
 */
export class MediaResponseDto {
  @ApiProperty({ description: 'Unique media ID' })
  id!: string;

  @ApiProperty({ description: 'Original filename' })
  filename!: string;

  @ApiProperty({ description: 'MIME type of the file' })
  mimeType!: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  size?: number | null;

  @ApiProperty({ description: 'Public URL to access the file' })
  publicUrl!: string;

  @ApiProperty({ description: 'Upload status', enum: ['PENDING', 'CONFIRMED'] })
  status!: string;

  @ApiProperty({ description: 'When the media was created' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'When the upload was confirmed' })
  confirmedAt?: Date | null;
}
