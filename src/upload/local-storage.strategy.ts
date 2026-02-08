import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { StorageStrategy } from './storage.strategy';

/**
 * Local filesystem storage strategy
 * Task 7.2: Store files in ./uploads/{folder}/{timestamp}-{filename}
 */
@Injectable()
export class LocalStorageStrategy implements StorageStrategy {
  private readonly logger = new Logger(LocalStorageStrategy.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Default upload directory: ./uploads
    this.uploadDir = this.configService.get('UPLOAD_DIR', './uploads');

    // Base URL for public access (e.g., http://localhost:3000)
    this.baseUrl = this.configService.get(
      'API_BASE_URL',
      'http://localhost:3000',
    );

    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  /**
   * Upload file to local filesystem
   * Creates nested directories if needed
   */
  async upload(
    file: Buffer,
    folder: string,
    filename: string,
  ): Promise<string> {
    try {
      // Create timestamp prefix to ensure uniqueness
      const timestamp = Date.now();
      const safeFilename = this.sanitizeFilename(filename);
      const finalFilename = `${timestamp}-${safeFilename}`;

      // Build full path: uploads/{folder}/{timestamp}-{filename}
      const folderPath = path.join(this.uploadDir, folder);
      const filePath = path.join(folderPath, finalFilename);

      // Create folder if it doesn't exist
      await fs.promises.mkdir(folderPath, { recursive: true });

      // Write file to disk
      await fs.promises.writeFile(filePath, file);

      // Return relative path (without ./uploads prefix)
      const relativePath = path.join(folder, finalFilename);

      this.logger.log(`File uploaded: ${relativePath}`);
      return relativePath;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from local filesystem
   */
  async delete(relativePath: string): Promise<void> {
    try {
      const filePath = path.join(this.uploadDir, relativePath);

      // Check if file exists before attempting deletion
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.log(`File deleted: ${relativePath}`);
      } else {
        this.logger.warn(`File not found for deletion: ${relativePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * Get public URL for accessing the file
   * Returns URL like: http://localhost:3000/uploads/alerts/123456-dog.jpg
   */
  getPublicUrl(relativePath: string): string {
    // Normalize path separators to forward slashes for URLs (Windows compatibility)
    const normalizedPath = relativePath.replace(/\\/g, '/');
    return `${this.baseUrl}/uploads/${normalizedPath}`;
  }

  /**
   * Ensure upload directory exists
   */
  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  /**
   * Sanitize filename to prevent directory traversal attacks
   * Removes special characters and path separators
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .replace(/\.+/g, '.') // Replace multiple dots with single dot
      .replace(/^\./, '') // Remove leading dot
      .substring(0, 255); // Limit length to 255 chars
  }
}
