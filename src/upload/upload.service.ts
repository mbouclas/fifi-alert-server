import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudinaryService,
  CloudinaryUploadOptions,
} from './cloudinary.service';
import { sniffImageType } from './image-type';

export type ImageUploadOptions = CloudinaryUploadOptions;

/**
 * Upload service for handling file uploads
 * Task 7.3: Validates files, enforces size/type limits, coordinates storage
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  /** Default cap on files per uploadImages call when the caller passes none. */
  static readonly DEFAULT_MAX_FILES_PER_UPLOAD = 5;

  // File upload limits
  private readonly maxFileSize: number;
  private readonly allowedImageTypes: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    // Max file size: 10MB (configurable via env)
    this.maxFileSize = this.configService.get(
      'MAX_FILE_SIZE',
      10 * 1024 * 1024,
    );

    // Allowed image MIME types
    this.allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ];
  }

  /**
   * Resolve the effective MIME type of an upload.
   *
   * The bytes are sniffed first because some Android pickers send HEIC with
   * an empty or `application/octet-stream` content type, and a spoofed header
   * must not let a non-image through. The header is only used when the bytes
   * are not a recognised image.
   */
  private resolveMimeType(file: Express.Multer.File): string {
    const sniffed = sniffImageType(file.buffer);
    if (sniffed) {
      return sniffed;
    }
    return (file.mimetype || '').toLowerCase();
  }

  /**
   * Upload a single image file
   * @param file - Express.Multer.File object
   * @param folder - Target Cloudinary subfolder ('alerts', 'sightings/{id}', or 'pets/{id}')
   * @param options - Optional processing (web optimisation, random public id)
   * @returns Cloudinary secure URL of uploaded file
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: string,
    options: ImageUploadOptions = {},
  ): Promise<string> {
    // Validate file exists
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file size
    if (file.size > this.maxFileSize) {
      const maxSizeMB = this.maxFileSize / (1024 * 1024);
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
      );
    }

    // Validate file type (sniffed from bytes, header as fallback)
    const mimeType = this.resolveMimeType(file);
    if (!this.allowedImageTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedImageTypes.join(', ')}`,
      );
    }

    const secureUrl = await this.cloudinaryService.uploadImage(
      file.buffer,
      folder,
      file.originalname,
      options,
    );

    this.logger.log(`Image uploaded successfully: ${secureUrl}`);
    return secureUrl;
  }

  /**
   * Upload multiple image files
   * @param files - Array of Express.Multer.File objects
   * @param folder - Target Cloudinary subfolder ('alerts', 'sightings/{id}', or 'pets/{id}')
   * @param maxFiles - Reject the batch when it holds more files than this
   * @param options - Optional processing applied to every file
   * @returns Array of Cloudinary secure URLs, in the order received
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder: string,
    maxFiles: number = UploadService.DEFAULT_MAX_FILES_PER_UPLOAD,
    options: ImageUploadOptions = {},
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      return [];
    }

    if (files.length > maxFiles) {
      throw new BadRequestException(
        `Maximum ${maxFiles} images allowed per upload`,
      );
    }

    // Upload all files in parallel
    const uploadPromises = files.map((file) =>
      this.uploadImage(file, folder, options),
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a file from Cloudinary
   * @param url - Full Cloudinary secure URL of file
   */
  async deleteFile(url: string): Promise<void> {
    try {
      await this.cloudinaryService.deleteImageByUrl(url);

      this.logger.log(`File deleted: ${url}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      // Don't throw error - file might already be deleted
    }
  }
}
