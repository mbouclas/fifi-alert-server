import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger DTO for uploading one or more pet photo files.
 */
export class UploadPetPhotosDto {
  @ApiProperty({
    description: 'Pet photo image files. Use the multipart field name photos.',
    type: 'array',
    items: { type: 'string', format: 'binary' },
  })
  photos: Express.Multer.File[];
}

/**
 * Response DTO returned after pet photo files are stored.
 */
export class PetPhotoUploadResponseDto {
  @ApiProperty({
    description: 'Backend-hosted public URLs for the uploaded pet photos.',
    type: [String],
    example: [
      'https://res.cloudinary.com/demo/image/upload/v1714074520/fifi-alert/pets/123/buddy.jpg',
    ],
  })
  photoUrls: string[];
}
