import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GpsLocationDto } from './register-device.dto';

/**
 * DTO for updating device location
 */
export class UpdateLocationDto {
  @ApiProperty({
    description: 'Updated GPS location',
    type: GpsLocationDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GpsLocationDto)
  gps?: GpsLocationDto;

  @ApiProperty({
    description: 'Updated postal/ZIP codes for geofencing (up to 5)',
    example: ['94102', '94103'],
    required: false,
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  postal_codes?: string[];
}
