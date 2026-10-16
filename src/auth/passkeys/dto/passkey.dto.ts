import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const PASSKEY_NAME_MAX_LENGTH = 64;

const WEBAUTHN_JSON_NOTE =
  'WebAuthn Level 3 JSON serialisation (as produced / consumed by @simplewebauthn); all binary fields are base64url.';

/**
 * Client-facing passkey. Never includes `publicKey`, `counter` or
 * `credentialId`.
 */
export class PasskeyDto {
  @ApiProperty({ example: 'clz3k9x2a0000abcdefghijk' })
  id: string;

  @ApiProperty({ example: 'MacBook Pro', maxLength: PASSKEY_NAME_MAX_LENGTH })
  name: string;

  @ApiProperty({ example: '2026-10-16T09:12:33.000Z', description: 'ISO 8601' })
  createdAt: string;

  @ApiProperty({
    example: '2026-10-16T09:20:01.000Z',
    nullable: true,
    type: String,
  })
  lastUsedAt: string | null;

  @ApiProperty({ example: 'adce0002-35bc-c60a-648b-0b25f1f05503' })
  aaguid: string;

  @ApiProperty({ enum: ['singleDevice', 'multiDevice'] })
  deviceType: 'singleDevice' | 'multiDevice';

  @ApiProperty({ example: true })
  backedUp: boolean;

  @ApiProperty({ example: ['internal', 'hybrid'], type: [String] })
  transports: string[];
}

export class PasskeyRegistrationOptionsResponseDto {
  @ApiProperty({ example: 'c_01HZX...' })
  challengeId: string;

  @ApiProperty({
    type: Object,
    description: `PublicKeyCredentialCreationOptionsJSON. ${WEBAUTHN_JSON_NOTE}`,
  })
  options: Record<string, unknown>;
}

export class PasskeyAuthenticationOptionsResponseDto {
  @ApiProperty({ example: 'c_01HZY...' })
  challengeId: string;

  @ApiProperty({
    type: Object,
    description: `PublicKeyCredentialRequestOptionsJSON with an always-empty allowCredentials. ${WEBAUTHN_JSON_NOTE}`,
  })
  options: Record<string, unknown>;
}

export class PasskeyRegisterOptionsDto {
  @ApiPropertyOptional({
    description: 'Optional label; ignored here, send it again on verify.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PASSKEY_NAME_MAX_LENGTH)
  name?: string;
}

export class PasskeyRegisterVerifyDto {
  @ApiProperty({ example: 'c_01HZX...' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiPropertyOptional({
    description: `User-facing label, trimmed, 1-${PASSKEY_NAME_MAX_LENGTH} chars. Defaults to "Passkey <date>".`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PASSKEY_NAME_MAX_LENGTH)
  name?: string;

  @ApiProperty({
    type: Object,
    description: `RegistrationResponseJSON. ${WEBAUTHN_JSON_NOTE}`,
  })
  @IsObject()
  response: Record<string, unknown>;
}

export class PasskeyLoginVerifyDto {
  @ApiProperty({ example: 'c_01HZY...' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiProperty({
    type: Object,
    description: `AuthenticationResponseJSON. ${WEBAUTHN_JSON_NOTE}`,
  })
  @IsObject()
  response: Record<string, unknown>;
}

export class RenamePasskeyDto {
  @ApiProperty({
    example: 'Work laptop',
    minLength: 1,
    maxLength: PASSKEY_NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, PASSKEY_NAME_MAX_LENGTH)
  name: string;
}
