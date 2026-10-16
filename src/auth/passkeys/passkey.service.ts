import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Passkey, Prisma } from '@prisma-lib/client';
import { PrismaService } from '../../services/prisma.service';
import type { IPasskeyConfig } from '@config/passkey.config';
import { PasskeyChallengeStore } from './passkey-challenge.store';
import {
  PASSKEY_NAME_MAX_LENGTH,
  PasskeyAuthenticationOptionsResponseDto,
  PasskeyDto,
  PasskeyRegistrationOptionsResponseDto,
} from './dto/passkey.dto';

/** DI token for the relying-party config (provided in AuthEndpointsModule). */
export const PASSKEY_CONFIG = Symbol('PASSKEY_CONFIG');

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Please verify your email address before logging in. We sent a new verification link to your email.';

/**
 * Thrown by finishLogin BEFORE the counter / lastUsedAt write when the
 * assertion is valid but the account's email is unverified. Carries the email
 * so the controller can resend the verification link (same rule as
 * /auth/login).
 */
export class PasskeyEmailNotVerifiedException extends ForbiddenException {
  constructor(public readonly email: string) {
    super(EMAIL_NOT_VERIFIED_MESSAGE);
  }
}

export const PASSKEY_ERRORS = {
  notConfigured: 'passkeys not configured',
  unknownChallenge: 'unknown or expired challenge',
  verificationFailed: 'verification failed',
  alreadyRegistered: 'credential already registered',
  unknownCredential: 'unknown credential',
  notFound: 'passkey not found',
} as const;

/** COSE algorithms offered to the authenticator: ES256 and RS256. */
const SUPPORTED_ALGORITHM_IDS = [-7, -257];
const CEREMONY_TIMEOUT_MS = 60_000;

/**
 * PasskeyService
 *
 * Thin wrapper around @simplewebauthn/server. Owns the Passkey rows, the
 * challenge lifecycle (via PasskeyChallengeStore) and the HTTP error mapping
 * from the work order so the controller stays declarative.
 *
 * Token issuance after a successful passkey login is NOT here: the controller
 * hands the user id to LoginIssuerService, exactly like /auth/login does.
 */
@Injectable()
export class PasskeyService implements OnModuleInit {
  private readonly logger = new Logger(PasskeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: PasskeyChallengeStore,
    @Inject(PASSKEY_CONFIG) private readonly config: IPasskeyConfig,
  ) {}

  onModuleInit(): void {
    // A wrong RP_ID fails silently in the browser; make the effective values
    // visible at boot.
    if (this.config.enabled) {
      this.logger.log(
        `Passkeys enabled: rpId=${this.config.rpId} rpName="${this.config.rpName}" origins=${this.config.origins.join(',')}`,
      );
    } else {
      this.logger.warn(
        'Passkeys disabled: set RP_ID and RP_ORIGINS (and optionally RP_NAME) to enable /auth/passkeys/*',
      );
    }
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(PASSKEY_ERRORS.notConfigured);
    }
  }

  // ------------------------------------------------------------ registration

  async startRegistration(
    userId: number,
  ): Promise<PasskeyRegistrationOptionsResponseDto> {
    this.assertEnabled();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const existing = await this.prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      // The user handle must be opaque and stable; the numeric id as bytes.
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.email,
      userDisplayName: user.name || user.email,
      timeout: CEREMONY_TIMEOUT_MS,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as never[],
      })),
      authenticatorSelection: {
        // Mandatory: discoverable credentials are what make conditional UI
        // and the anonymous login endpoint work.
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    });

    const challengeId = await this.challenges.create({
      challenge: options.challenge,
      type: 'register',
      userId,
    });

    return {
      challengeId,
      options: options as unknown as Record<string, unknown>,
    };
  }

  async finishRegistration(
    userId: number,
    input: {
      challengeId: string;
      name?: string;
      response: Record<string, unknown>;
    },
  ): Promise<PasskeyDto> {
    this.assertEnabled();

    const stored = await this.challenges.consume(input.challengeId);
    if (!stored || stored.type !== 'register' || stored.userId !== userId) {
      throw new BadRequestException(PASSKEY_ERRORS.unknownChallenge);
    }

    const response = input.response as unknown as RegistrationResponseJSON;

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.config.origins,
        expectedRPID: this.config.rpId,
        // Options ask for userVerification 'preferred'; do not reject
        // authenticators that skipped UV.
        requireUserVerification: false,
      });
    } catch (error) {
      this.logger.warn(
        `Passkey registration verification threw for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(PASSKEY_ERRORS.verificationFailed);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException(PASSKEY_ERRORS.verificationFailed);
    }

    const { credential, aaguid, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const duplicate = await this.prisma.passkey.findUnique({
      where: { credentialId: credential.id },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(PASSKEY_ERRORS.alreadyRegistered);
    }

    const transports =
      credential.transports ?? response.response?.transports ?? [];

    try {
      const row = await this.prisma.passkey.create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: [...transports],
          aaguid,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: normalisePasskeyName(input.name),
        },
      });
      this.logger.log(`Passkey registered for user ${userId} (${row.id})`);
      return toPasskeyDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(PASSKEY_ERRORS.alreadyRegistered);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------- authentication

  async startLogin(): Promise<PasskeyAuthenticationOptionsResponseDto> {
    this.assertEnabled();

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      timeout: CEREMONY_TIMEOUT_MS,
      userVerification: 'preferred',
      // Always empty: the browser offers the discoverable credentials it
      // holds for this RP. The server never learns the email first.
      allowCredentials: [],
    });

    const challengeId = await this.challenges.create({
      challenge: options.challenge,
      type: 'login',
    });

    return {
      challengeId,
      options: {
        ...(options as unknown as Record<string, unknown>),
        allowCredentials: [],
      },
    };
  }

  /**
   * Verifies the assertion and returns the owning user's id. Token issuance
   * is the controller's job (shared with /auth/login).
   *
   * Order matters: challenge -> credential -> signature -> email-verified
   * gate -> counter/lastUsedAt write. A valid assertion from an unverified
   * account must leave the row untouched (frontend review, 2026-10-17).
   */
  async finishLogin(input: {
    challengeId: string;
    response: Record<string, unknown>;
  }): Promise<{ userId: number; passkeyId: string }> {
    this.assertEnabled();

    const stored = await this.challenges.consume(input.challengeId);
    if (!stored || stored.type !== 'login') {
      throw new BadRequestException(PASSKEY_ERRORS.unknownChallenge);
    }

    const response = input.response as unknown as AuthenticationResponseJSON;
    const credentialId =
      typeof response?.id === 'string' ? response.id : undefined;
    if (!credentialId) {
      throw new UnauthorizedException(PASSKEY_ERRORS.unknownCredential);
    }

    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId },
    });
    if (!passkey) {
      throw new UnauthorizedException(PASSKEY_ERRORS.unknownCredential);
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.config.origins,
        expectedRPID: this.config.rpId,
        requireUserVerification: false,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as never[],
        },
      });
    } catch (error) {
      // Includes counter regression ("Response counter value X was lower
      // than expected Y") = cloned authenticator. Reject, do not leak why.
      this.logger.warn(
        `Passkey login verification threw for passkey ${passkey.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException(PASSKEY_ERRORS.verificationFailed);
    }

    if (!verification.verified) {
      throw new UnauthorizedException(PASSKEY_ERRORS.verificationFailed);
    }

    // Same gate as /auth/login, checked BEFORE any write so a 403 leaves the
    // counter and lastUsedAt exactly as they were.
    const owner = await this.prisma.user.findUnique({
      where: { id: passkey.userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!owner) {
      throw new UnauthorizedException('User not found');
    }
    if (!owner.emailVerified) {
      throw new PasskeyEmailNotVerifiedException(owner.email);
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
        backedUp: verification.authenticationInfo.credentialBackedUp,
      },
    });

    return { userId: passkey.userId, passkeyId: passkey.id };
  }

  // -------------------------------------------------------------- management

  async list(userId: number): Promise<PasskeyDto[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPasskeyDto);
  }

  async countForUser(userId: number): Promise<number> {
    return this.prisma.passkey.count({ where: { userId } });
  }

  async rename(userId: number, id: string, name: string): Promise<PasskeyDto> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > PASSKEY_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `name must be 1-${PASSKEY_NAME_MAX_LENGTH} characters`,
      );
    }
    const existing = await this.findOwned(userId, id);
    const row = await this.prisma.passkey.update({
      where: { id: existing.id },
      data: { name: trimmed },
    });
    return toPasskeyDto(row);
  }

  async remove(userId: number, id: string): Promise<void> {
    const existing = await this.findOwned(userId, id);
    await this.prisma.passkey.delete({ where: { id: existing.id } });
    this.logger.log(`Passkey ${id} removed by user ${userId}`);
  }

  /** 404 for both "does not exist" and "belongs to another user". */
  private async findOwned(userId: number, id: string): Promise<Passkey> {
    const row = await this.prisma.passkey.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException(PASSKEY_ERRORS.notFound);
    }
    return row;
  }
}

// ------------------------------------------------------------------- helpers

export function normalisePasskeyName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length > 0) {
    return trimmed.slice(0, PASSKEY_NAME_MAX_LENGTH);
  }
  return `Passkey ${new Date().toISOString().slice(0, 10)}`;
}

export function toPasskeyDto(row: Passkey): PasskeyDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    aaguid: row.aaguid,
    deviceType: row.deviceType as PasskeyDto['deviceType'],
    backedUp: row.backedUp,
    transports: row.transports,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
  );
}
