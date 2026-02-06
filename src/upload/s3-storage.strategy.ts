import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageStrategy } from './storage.strategy';

/**
 * S3 Storage Strategy - Stub for future AWS S3 integration
 * Task 7.10
 * 
 * TODO: Implement AWS S3 SDK integration
 * 
 * Required Environment Variables:
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 * - AWS_REGION: AWS region (e.g., us-east-1)
 * - AWS_S3_BUCKET: S3 bucket name
 * - AWS_S3_PUBLIC_URL: Public URL for S3 bucket (optional, defaults to standard S3 URL)
 * 
 * Required Dependencies (to be installed):
 * - @aws-sdk/client-s3
 * - @aws-sdk/s3-request-presigner (for signed URLs if needed)
 * 
 * Implementation Steps:
 * 1. Install AWS SDK: bun add @aws-sdk/client-s3
 * 2. Initialize S3Client in constructor with credentials from ConfigService
 * 3. Implement upload() using PutObjectCommand
 *    - Generate unique S3 key: {folder}/{timestamp}-{filename}
 *    - Set proper content-type based on file extension
 *    - Set public-read ACL or configure bucket policy for public access
 * 4. Implement delete() using DeleteObjectCommand
 * 5. Implement getPublicUrl() to return:
 *    - Custom CloudFront URL if configured
 *    - Standard S3 URL: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *    - Or pre-signed URL for private buckets
 * 
 * Migration from Local to S3:
 * 1. Set UPLOAD_STORAGE=s3 in environment
 * 2. Update UploadModule to conditionally inject S3StorageStrategy
 * 3. Optional: Write migration script to copy existing files from ./uploads to S3
 * 4. Update static file serving to redirect to S3 URLs
 */
@Injectable()
export class S3StorageStrategy implements StorageStrategy {
    constructor(private readonly configService: ConfigService) {
        // TODO: Initialize S3Client here
        // const s3Client = new S3Client({
        //     region: this.configService.get('AWS_REGION'),
        //     credentials: {
        //         accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        //         secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
        //     },
        // });
    }

    /**
     * Upload a file to S3
     * 
     * TODO Implementation:
     * ```typescript
     * const key = `${folder}/${Date.now()}-${filename}`;
     * const command = new PutObjectCommand({
     *     Bucket: this.configService.get('AWS_S3_BUCKET'),
     *     Key: key,
     *     Body: file,
     *     ContentType: this.getContentType(filename),
     *     ACL: 'public-read', // Or use bucket policy
     * });
     * await this.s3Client.send(command);
     * return key;
     * ```
     */
    async upload(file: Buffer, folder: string, filename: string): Promise<string> {
        throw new NotImplementedException(
            'S3 storage strategy not implemented. Set UPLOAD_STORAGE=local to use local filesystem storage.',
        );
    }

    /**
     * Delete a file from S3
     * 
     * TODO Implementation:
     * ```typescript
     * const command = new DeleteObjectCommand({
     *     Bucket: this.configService.get('AWS_S3_BUCKET'),
     *     Key: path,
     * });
     * await this.s3Client.send(command);
     * ```
     */
    async delete(path: string): Promise<void> {
        throw new NotImplementedException(
            'S3 storage strategy not implemented. Set UPLOAD_STORAGE=local to use local filesystem storage.',
        );
    }

    /**
     * Get public URL for an S3 object
     * 
     * TODO Implementation:
     * ```typescript
     * const cloudFrontUrl = this.configService.get('AWS_S3_PUBLIC_URL');
     * if (cloudFrontUrl) {
     *     return `${cloudFrontUrl}/${path}`;
     * }
     * const bucket = this.configService.get('AWS_S3_BUCKET');
     * const region = this.configService.get('AWS_REGION');
     * return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
     * ```
     */
    getPublicUrl(path: string): string {
        throw new NotImplementedException(
            'S3 storage strategy not implemented. Set UPLOAD_STORAGE=local to use local filesystem storage.',
        );
    }

    /**
     * Helper to determine content type from filename
     * 
     * TODO Implementation:
     * ```typescript
     * private getContentType(filename: string): string {
     *     const ext = filename.toLowerCase().split('.').pop();
     *     const mimeTypes: Record<string, string> = {
     *         jpg: 'image/jpeg',
     *         jpeg: 'image/jpeg',
     *         png: 'image/png',
     *         webp: 'image/webp',
     *         heic: 'image/heic',
     *     };
     *     return mimeTypes[ext] || 'application/octet-stream';
     * }
     * ```
     */
}
