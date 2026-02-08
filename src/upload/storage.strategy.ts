/**
 * Storage strategy interface for file uploads
 * Allows switching between local filesystem and cloud storage (S3)
 */
export interface StorageStrategy {
  /**
   * Upload a file to storage
   * @param file - Buffer containing file data
   * @param folder - Destination folder (e.g., 'alerts', 'sightings')
   * @param filename - Desired filename
   * @returns Path to stored file
   */
  upload(file: Buffer, folder: string, filename: string): Promise<string>;

  /**
   * Delete a file from storage
   * @param path - Path to file
   */
  delete(path: string): Promise<void>;

  /**
   * Get public URL for a file
   * @param path - Path to file
   * @returns Full public URL
   */
  getPublicUrl(path: string): string;
}
