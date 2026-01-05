import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Service for interacting with Cloudflare R2 storage using S3-compatible API.
 * Handles presigned URL generation, object operations, and bucket management.
 *
 * Required environment variables:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 access key
 * - R2_SECRET_ACCESS_KEY: R2 secret key
 * - R2_BUCKET_NAME: Name of the R2 bucket
 * - R2_PUBLIC_URL: Public URL base for the bucket (e.g., https://pub-xxx.r2.dev or custom domain)
 * - R2_PRESIGNED_URL_EXPIRY: (Optional) Presigned URL expiry in seconds, defaults to 3600
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly presignedUrlExpiry: number;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>('R2_ACCOUNT_ID');
    const accessKeyId =
      this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.getOrThrow<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    this.bucketName = this.configService.getOrThrow<string>('R2_BUCKET_NAME');
    this.presignedUrlExpiry = this.configService.get<number>(
      'R2_PRESIGNED_URL_EXPIRY',
      3600,
    );
    this.publicUrl = this.configService.getOrThrow<string>('R2_PUBLIC_URL');

    // Initialize S3 client with R2 endpoint
    // R2 has limited S3 API compatibility - requires specific configuration
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // R2-specific: Use path-style URLs (required for R2 compatibility)
      forcePathStyle: true,
      // R2-specific: Disable automatic checksum calculation
      // R2 only supports specific checksum types (CRC-32, CRC-32C, SHA-1, SHA-256)
      // Setting to 'WHEN_REQUIRED' prevents SDK from sending unsupported checksums
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log('R2 service initialized successfully');
  }

  /**
   * Generates a presigned URL for uploading a file to R2.
   * The URL allows direct client-side uploads without exposing credentials.
   * IMPORTANT: The client MUST send the exact Content-Type header specified here.
   *
   * @param key - The object key (path) in the bucket
   * @param contentType - MIME type of the file being uploaded
   * @param expiresIn - Optional custom expiry time in seconds
   * @returns Presigned URL for PUT operation
   */
  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      // ContentType: contentType,
    });

    const expiryTime = expiresIn ?? this.presignedUrlExpiry;
    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiryTime,
      // Include content-type in signed headers so client can use it
      // signableHeaders: new Set(['content-type']),
    });

    this.logger.debug(`Generated upload URL for key: ${key}`);
    return signedUrl;
  }

  /**
   * Generates a presigned URL for downloading/viewing a file from R2.
   *
   * @param key - The object key (path) in the bucket
   * @param expiresIn - Optional custom expiry time in seconds
   * @returns Presigned URL for GET operation
   */
  async generateDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const expiryTime = expiresIn ?? this.presignedUrlExpiry;
    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiryTime,
    });

    this.logger.debug(`Generated download URL for key: ${key}`);
    return signedUrl;
  }

  /**
   * Returns the public URL for an object.
   * Requires R2_PUBLIC_URL to be configured (r2.dev subdomain or custom domain).
   *
   * @param key - The object key (path) in the bucket
   * @returns Public URL for direct access
   */
  getPublicUrl(key: string): string {
    // Remove trailing slash from publicUrl if present
    const baseUrl = this.publicUrl.replace(/\/$/, '');
    return `${baseUrl}/${key}`;
  }

  /**
   * Returns the public URL for an object if public access is configured,
   * otherwise generates a presigned download URL.
   *
   * @param key - The object key (path) in the bucket
   * @returns Public URL or presigned download URL
   */
  async getAccessUrl(key: string): Promise<string> {
    if (this.publicUrl) {
      return this.getPublicUrl(key);
    }
    return this.generateDownloadUrl(key);
  }

  /**
   * Checks if an object exists in R2 and retrieves its metadata.
   *
   * @param key - The object key to check
   * @returns Object metadata including size and content type, or null if not found
   */
  async headObject(key: string): Promise<{
    contentLength: number;
    contentType: string | undefined;
    lastModified: Date | undefined;
  } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
        lastModified: response.LastModified,
      };
    } catch (error) {
      // Check if error is a "not found" type
      if (
        error instanceof Error &&
        (error.name === 'NotFound' || error.name === 'NoSuchKey')
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes an object from R2.
   *
   * @param key - The object key to delete
   * @returns True if deletion was successful
   */
  async deleteObject(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.debug(`Deleted object: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete object ${key}:`, error);
      throw error;
    }
  }

  /**
   * Deletes multiple objects from R2.
   *
   * @param keys - Array of object keys to delete
   * @returns Array of results indicating success/failure for each key
   */
  async deleteObjects(
    keys: string[],
  ): Promise<{ key: string; success: boolean; error?: string }[]> {
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        await this.deleteObject(key);
        return key;
      }),
    );

    return results.map((result, index) => ({
      key: keys[index],
      success: result.status === 'fulfilled',
      error:
        result.status === 'rejected'
          ? (result.reason as Error).message
          : undefined,
    }));
  }

  /**
   * Generates a unique object key for media uploads.
   * Format: media/{userId}/{mediaId}/{filename}
   *
   * @param userId - ID of the uploading user
   * @param mediaId - Unique media identifier
   * @param filename - Original filename
   * @returns Generated object key
   */
  generateMediaKey(userId: string, mediaId: string, filename: string): string {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `media/${userId}/${mediaId}/${sanitizedFilename}`;
  }
}
