import { ApiProperty } from '@nestjs/swagger';
import { getMaxSightingPhotos } from '../../config/sighting.config';

/**
 * Swagger DTO for uploading one or more sighting photo files.
 */
export class UploadSightingPhotosDto {
  @ApiProperty({
    description:
      'Sighting photo image files (JPEG, PNG, WebP, HEIC/HEIF; max 10MB each). Use the multipart field name photos, repeated once per file.',
    type: 'array',
    items: { type: 'string', format: 'binary' },
    minItems: 1,
    maxItems: getMaxSightingPhotos(),
  })
  photos: Express.Multer.File[];
}

/**
 * Response DTO returned after sighting photo files are stored.
 */
export class SightingPhotoUploadResponseDto {
  @ApiProperty({
    description:
      'Public CDN URLs for the photos uploaded in this request, in the order received. They are already persisted on the sighting.',
    type: [String],
    example: [
      'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/sightings/123/5f1c2c8e-4a1d-4a4c-9d7a-1b2c3d4e5f60.jpg',
    ],
  })
  photoUrls: string[];
}
