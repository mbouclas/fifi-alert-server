import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

/**
 * Upload service for handling file uploads
 * Task 7.3: Validates files, enforces size/type limits, coordinates storage
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

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
    ];
  }

  /**
   * Upload a single image file
   * @param file - Express.Multer.File object
   * @param folder - Target Cloudinary subfolder ('alerts', 'sightings', or 'pets/{id}')
   * @returns Cloudinary secure URL of uploaded file
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: string,
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

    // Validate file type
    if (!this.allowedImageTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedImageTypes.join(', ')}`,
      );
    }

    const secureUrl = await this.cloudinaryService.uploadImage(
      file.buffer,
      folder,
      file.originalname,
    );

    this.logger.log(`Image uploaded successfully: ${secureUrl}`);
    return secureUrl;
  }

  /**
   * Upload multiple image files
   * @param files - Array of Express.Multer.File objects
   * @param folder - Target Cloudinary subfolder ('alerts', 'sightings', or 'pets/{id}')
   * @returns Array of Cloudinary secure URLs
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      return [];
    }

    // Limit to 5 images per upload
    if (files.length > 5) {
      throw new BadRequestException('Maximum 5 images allowed per upload');
    }

    // Upload all files in parallel
    const uploadPromises = files.map((file) => this.uploadImage(file, folder));
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
