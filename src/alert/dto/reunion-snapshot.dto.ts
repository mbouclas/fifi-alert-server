import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Public "pet is home" snapshot, frozen when an alert is resolved as found.
 * Served by GET /alerts/by-tag/{tagId}/reunion. This IS the public DTO: it
 * never carries owner data.
 */
export class ReunionSnapshotDto {
  @ApiProperty({ example: 'PET7K9X2A', description: 'Pet collar tag id' })
  tagId: string;

  @ApiProperty({ example: 41, description: 'Alert that was resolved' })
  alertId: number;

  @ApiProperty({ example: 'Bella' })
  petName: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://cdn/.../pets/5/primary.jpg',
    description: 'The primary photo of the pet at resolve time',
  })
  petPhotoUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 500,
    example: 'Thank you everyone who looked for Bella!',
    description:
      'Public thank-you note (plain text), null when none was posted',
  })
  thankYouMessage: string | null;

  @ApiProperty({ example: '2026-10-04T18:00:00.000Z' })
  resolvedAt: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 1420,
    description:
      'Distinct users the original alert reached while ACTIVE; null when unknown',
  })
  neighboursNotified: number | null;

  @ApiProperty({
    example: 12,
    description: 'Sightings reported on the alert, dismissed included',
  })
  sightingsReported: number;

  @ApiProperty({
    example: '2026-11-03T18:00:00.000Z',
    description: 'After this instant the snapshot returns 404',
  })
  expiresAt: string;
}
