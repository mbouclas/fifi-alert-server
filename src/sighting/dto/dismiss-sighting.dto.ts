import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for dismissing a sighting
 */
export class DismissSightingDto {
  @ApiProperty({
    description: 'Reason for dismissing this sighting',
    example: 'This is not my pet - different breed',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
