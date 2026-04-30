import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UploadApiErrorResponse,
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  /**
   * Upload an image buffer to Cloudinary and return its HTTPS delivery URL.
   */
  async uploadImage(
    file: Buffer,
    folder: string,
    filename: string,
  ): Promise<string> {
    this.ensureConfigured();

    const uploadFolder = this.buildFolder(folder);
    const publicId = this.buildPublicId(filename);

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: uploadFolder,
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          unique_filename: true,
        },
        (
          error: UploadApiErrorResponse | undefined,
          uploadResult: UploadApiResponse | undefined,
        ) => {
          if (error) {
            reject(error);
            return;
          }

          if (!uploadResult?.secure_url) {
            reject(new Error('Cloudinary upload did not return a secure URL'));
            return;
          }

          resolve(uploadResult);
        },
      );

      uploadStream.end(file);
    });

    this.logger.log(`Image uploaded to Cloudinary: ${result.public_id}`);
    return result.secure_url;
  }

  /**
   * Delete a Cloudinary image when its public URL is known.
   */
  async deleteImageByUrl(url: string): Promise<void> {
    this.ensureConfigured();

    const publicId = this.extractPublicId(url);
    if (!publicId) {
      throw new Error('Invalid Cloudinary URL format');
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    this.logger.log(`Cloudinary image deleted: ${publicId}`);
  }

  private ensureConfigured(): void {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'Cloudinary upload is not configured',
      );
    }
  }

  private buildFolder(folder: string): string {
    const baseFolder = this.configService.get<string>('CLOUDINARY_FOLDER', '');
    return [baseFolder, folder]
      .filter(Boolean)
      .map((pathSegment) => pathSegment.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
  }

  private buildPublicId(filename: string): string {
    const extensionlessFilename = filename.replace(/\.[^/.]+$/, '');
    const safeFilename = extensionlessFilename
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 120);

    return `${Date.now()}-${safeFilename || 'image'}`;
  }

  private extractPublicId(url: string): string | undefined {
    const uploadMarker = '/upload/';
    const uploadIndex = url.indexOf(uploadMarker);

    if (uploadIndex === -1) {
      return undefined;
    }

    const pathAfterUpload = url.slice(uploadIndex + uploadMarker.length);
    const pathWithoutQuery = pathAfterUpload.split('?')[0];
    const pathWithoutVersion = pathWithoutQuery.replace(/^v\d+\//, '');

    return pathWithoutVersion.replace(/\.[^/.]+$/, '');
  }
}
