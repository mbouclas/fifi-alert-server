import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Click-time confirmation.
 *
 * A service worker cannot read geolocation, so we cannot ask a device "are you in the
 * radius?" before sending. Instead the client re-reads its exact position when the user
 * opens the notification and reports back. This gives real precision/recall per
 * confidence tier so radii can be tuned with data.
 */
export class NotificationRelevanceDto {
  @ApiProperty({
    description:
      'Whether the device was actually inside the alert radius when the notification was opened',
    example: true,
  })
  @IsBoolean()
  inRange: boolean;

  @ApiProperty({
    description: 'Measured distance in km from the device to the alert location',
    example: 1.8,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;
}

export class VapidPublicKeyResponseDto {
  @ApiProperty({
    description: 'VAPID public key, used by the browser to subscribe to push',
    example: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  })
  publicKey: string;
}
