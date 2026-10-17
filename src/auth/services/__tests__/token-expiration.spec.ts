/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  TokenService,
  DEFAULT_ACCESS_EXPIRATION,
  DEFAULT_REFRESH_EXPIRATION,
  DEFAULT_REFRESH_REUSE_GRACE_SECONDS,
  IJwtPayload,
  RefreshTokenReuseError,
  hashToken,
} from '../token.service';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../services/prisma.service';

/**
 * Isolated unit tests for JWT expiration behaviour.
 *
 * These tests deliberately use a MOCKED PrismaService (no database dependency)
 * and register JwtModule WITHOUT any module-wide `expiresIn` — mirroring the
 * production AuthEndpointsModule after the module-wide `expiresIn` was removed.
 *
 * They verify that TokenService:
 *   1. signs access & refresh JWTs explicitly with their own validated durations,
 *   2. aligns the JWT `exp` claim with the persisted Session.expiresAt,
 *   3. defaults to 15m (access) / 30d (refresh),
 *   4. persists tokens as SHA-256 hashes (never the raw JWT),
 *   5. rotates refresh tokens with reuse detection, and
 *   6. rejects invalid duration strings.
 */
describe('TokenService - JWT expiration (isolated, mocked Prisma)', () => {
  let service: TokenService;
  let jwtService: JwtService;

  // Captures the last session persisted via prisma.session.create
  let createdSessions: any[];

  const TEST_SECRET = 'test-secret-key-for-jwt-expiration-tests';

  const buildUser = () => ({
    id: 42,
    email: 'user@example.com',
    name: 'Test User',
    roles: [{ role: { id: 1, slug: 'user', level: 1 } }],
    gates: [{ gate: { id: 7, slug: 'gate-a' } }],
  });

  const prismaMock = {
    session: {
      create: jest.fn((args: any) => {
        createdSessions.push(args.data);
        return Promise.resolve({ id: createdSessions.length, ...args.data });
      }),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    createdSessions = [];
    jest.clearAllMocks();

    // Ensure a clean env for default-based assertions per test.
    delete process.env.JWT_ACCESS_EXPIRATION;
    delete process.env.JWT_REFRESH_EXPIRATION;
    process.env.JWT_SECRET = TEST_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        // Register WITHOUT signOptions.expiresIn to mirror the fixed module.
        JwtModule.register({ secret: TEST_SECRET }),
      ],
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const decode = (token: string): IJwtPayload =>
    jwtService.verify<IJwtPayload>(token);

  describe('access token', () => {
    it('signs an access token that carries an exp claim even without a module-wide expiresIn', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);
      const payload = decode(token);

      expect(payload.type).toBe('access');
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
    });

    it('aligns the JWT exp claim with the persisted Session.expiresAt', async () => {
      const { token, expiresAt } = await service.generateAccessToken(
        buildUser() as any,
      );
      const payload = decode(token);

      // exp is in seconds; expiresAt is a Date.
      expect(payload.exp).toBe(Math.floor(expiresAt.getTime() / 1000));

      // And the same value was written to the Session row.
      expect(createdSessions).toHaveLength(1);
      expect(createdSessions[0].tokenType).toBe('access');
      expect(createdSessions[0].expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it('defaults the access token lifetime to 15 minutes', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);
      const payload = decode(token);

      const lifetimeSeconds = (payload.exp as number) - (payload.iat as number);
      expect(lifetimeSeconds).toBe(15 * 60);
      expect(DEFAULT_ACCESS_EXPIRATION).toBe('15m');
    });

    it('honours JWT_ACCESS_EXPIRATION when set', async () => {
      process.env.JWT_ACCESS_EXPIRATION = '1h';
      const { token } = await service.generateAccessToken(buildUser() as any);
      const payload = decode(token);

      const lifetimeSeconds = (payload.exp as number) - (payload.iat as number);
      expect(lifetimeSeconds).toBe(60 * 60);
    });
  });

  describe('refresh token', () => {
    it('aligns the JWT exp claim with the persisted Session.expiresAt', async () => {
      const { token, expiresAt } = await service.generateRefreshToken(
        buildUser() as any,
      );
      const payload = decode(token);

      expect(payload.type).toBe('refresh');
      expect(payload.exp).toBe(Math.floor(expiresAt.getTime() / 1000));
      expect(createdSessions).toHaveLength(1);
      expect(createdSessions[0].tokenType).toBe('refresh');
      expect(createdSessions[0].expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it('defaults the refresh token lifetime to 30 days (not the access lifetime)', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const payload = decode(token);

      const lifetimeSeconds = (payload.exp as number) - (payload.iat as number);
      expect(lifetimeSeconds).toBe(30 * 24 * 60 * 60);
      expect(DEFAULT_REFRESH_EXPIRATION).toBe('30d');
    });

    it('honours JWT_REFRESH_EXPIRATION when set', async () => {
      process.env.JWT_REFRESH_EXPIRATION = '7d';
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const payload = decode(token);

      const lifetimeSeconds = (payload.exp as number) - (payload.iat as number);
      expect(lifetimeSeconds).toBe(7 * 24 * 60 * 60);
    });

    it('carries a minimal payload (no roles/gates)', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const payload = decode(token);

      expect(payload.roles).toEqual([]);
      expect(payload.gates).toEqual([]);
    });
  });

  describe('token uniqueness (jti)', () => {
    it('mints distinct tokens for the same user within the same second', async () => {
      // Without a jti the payloads would be byte-identical (same iat), so a
      // fast rotation would reissue the token it had just revoked.
      const a = await service.generateRefreshToken(buildUser() as any);
      const b = await service.generateRefreshToken(buildUser() as any);

      expect(a.token).not.toBe(b.token);
      expect(decode(a.token).jti).toBeDefined();
      expect(decode(a.token).jti).not.toBe(decode(b.token).jti);
    });

    it('gives access tokens a jti too', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);
      expect(decode(token).jti).toBeDefined();
    });
  });

  describe('access vs refresh lifetimes differ', () => {
    it('signs the refresh token with a much longer lifetime than the access token', async () => {
      const access = await service.generateAccessToken(buildUser() as any);
      const refresh = await service.generateRefreshToken(buildUser() as any);

      const accessPayload = decode(access.token);
      const refreshPayload = decode(refresh.token);

      const accessLifetime =
        (accessPayload.exp as number) - (accessPayload.iat as number);
      const refreshLifetime =
        (refreshPayload.exp as number) - (refreshPayload.iat as number);

      expect(accessLifetime).toBe(15 * 60);
      expect(refreshLifetime).toBe(30 * 24 * 60 * 60);
      expect(refreshLifetime).toBeGreaterThan(accessLifetime);
    });
  });

  describe('token hashing at rest', () => {
    it('persists the SHA-256 hash of the access token, never the raw JWT', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);

      expect(createdSessions).toHaveLength(1);
      expect(createdSessions[0].token).toBe(hashToken(token));
      expect(createdSessions[0].token).not.toBe(token);
      expect(createdSessions[0].token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('persists the SHA-256 hash of the refresh token', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);

      expect(createdSessions[0].token).toBe(hashToken(token));
    });

    it('looks up access tokens by hash when validating', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: false,
        userId: 42,
        user: {
          id: 42,
          email: 'user@example.com',
          name: 'Test User',
          banned: false,
          banExpires: null,
          roles: [],
          gates: [],
        },
      });

      await service.validateAccessToken(token);

      expect(prismaMock.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: hashToken(token) } }),
      );
    });

    it('revokes by hash and excludes the current token by hash', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
      const raw = 'some.raw.jwt';

      await service.revokeToken(raw);
      expect(prismaMock.session.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { token: hashToken(raw), revoked: false },
        }),
      );

      await service.revokeAllUserTokens(42, raw);
      expect(prismaMock.session.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { userId: 42, revoked: false, token: { not: hashToken(raw) } },
        }),
      );
    });
  });

  describe('rotating refresh contract', () => {
    const userRow = () => ({
      id: 42,
      email: 'user@example.com',
      name: 'Test User',
      roles: [{ role: { id: 1, slug: 'user', level: 1, name: 'User' } }],
      gates: [{ gate: { id: 7, slug: 'gate-a', name: 'Gate A' } }],
    });

    beforeEach(() => {
      delete process.env.REFRESH_TOKEN_REUSE_GRACE_SECONDS;
    });

    it('revokes the presented refresh token and issues a new access + refresh pair', async () => {
      const { token: oldRefresh } = await service.generateRefreshToken(
        buildUser() as any,
      );
      createdSessions = [];

      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: false,
        revokedAt: null,
        userId: 42,
        tokenType: 'refresh',
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValueOnce(userRow());

      const rotated = await service.rotateRefreshToken(oldRefresh);

      // Old token atomically claimed (revoked) by hash.
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: hashToken(oldRefresh), revoked: false },
          data: expect.objectContaining({ revoked: true }),
        }),
      );

      // New pair issued and persisted (hashed).
      expect(rotated.userId).toBe(42);
      expect(rotated.refreshToken).not.toBe(oldRefresh);
      expect(decode(rotated.accessToken).type).toBe('access');
      expect(decode(rotated.refreshToken).type).toBe('refresh');
      expect(createdSessions.map((s) => s.tokenType).sort()).toEqual([
        'access',
        'refresh',
      ]);
      expect(createdSessions.map((s) => s.token)).toEqual(
        expect.arrayContaining([
          hashToken(rotated.accessToken),
          hashToken(rotated.refreshToken),
        ]),
      );
      expect(decode(rotated.accessToken).exp).toBe(
        Math.floor(rotated.accessExpiresAt.getTime() / 1000),
      );
      expect(decode(rotated.refreshToken).exp).toBe(
        Math.floor(rotated.refreshExpiresAt.getTime() / 1000),
      );
    });

    it('rejects an access token presented as a refresh token', async () => {
      const { token } = await service.generateAccessToken(buildUser() as any);
      await expect(service.rotateRefreshToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown refresh token without side effects', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      prismaMock.session.findUnique.mockResolvedValueOnce(null);

      await expect(service.rotateRefreshToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    /** A pair as the winner of a rotation would have minted it. */
    const issuedPair = async () => {
      const access = await service.generateAccessToken(buildUser() as any);
      const refresh = await service.generateRefreshToken(buildUser() as any);
      createdSessions = [];
      return {
        userId: 42,
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
        refreshToken: refresh.token,
        refreshExpiresAt: refresh.expiresAt,
      };
    };

    it('the winner stores the issued pair encrypted on the consumed row', async () => {
      const { token: oldRefresh } = await service.generateRefreshToken(
        buildUser() as any,
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: false,
        revokedAt: null,
        userId: 42,
        tokenType: 'refresh',
        replacementCiphertext: null,
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValueOnce(userRow());

      const rotated = await service.rotateRefreshToken(oldRefresh);

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: hashToken(oldRefresh) },
          data: { replacementCiphertext: expect.any(String) },
        }),
      );
      const stored = prismaMock.session.update.mock.calls[0][0].data
        .replacementCiphertext as string;
      expect(stored).not.toContain(rotated.refreshToken);
      expect(stored).not.toContain(rotated.accessToken);
      expect(service.decryptReplacement(stored)).toEqual(rotated);
    });

    it('a failed replacement store does not fail the refresh', async () => {
      const { token: oldRefresh } = await service.generateRefreshToken(
        buildUser() as any,
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: false,
        revokedAt: null,
        userId: 42,
        tokenType: 'refresh',
        replacementCiphertext: null,
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValueOnce(userRow());
      prismaMock.session.update.mockRejectedValueOnce(new Error('db down'));

      const rotated = await service.rotateRefreshToken(oldRefresh);
      expect(rotated.userId).toBe(42);
    });

    it('reuse INSIDE the grace window → replays the SAME pair, no family revoke', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = await issuedPair();
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          revoked: true,
          revokedAt: new Date(Date.now() - 5 * 1000), // 5s ago
          userId: 42,
          tokenType: 'refresh',
          replacementCiphertext: service.encryptReplacement(pair),
        })
        // child (replacement) refresh row: live
        .mockResolvedValueOnce({
          revoked: false,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          tokenType: 'refresh',
        });

      const replayed = await service.rotateRefreshToken(token);

      expect(replayed).toEqual(pair);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(createdSessions).toEqual([]); // nothing new minted
      expect(DEFAULT_REFRESH_REUSE_GRACE_SECONDS).toBe(300);
    });

    it('reuse INSIDE the grace window with the child already revoked → 401, no family revoke', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = await issuedPair();
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          revoked: true,
          revokedAt: new Date(Date.now() - 5 * 1000),
          userId: 42,
          tokenType: 'refresh',
          replacementCiphertext: service.encryptReplacement(pair),
        })
        .mockResolvedValueOnce({
          revoked: true, // logged out meanwhile
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          tokenType: 'refresh',
        });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err).not.toBeInstanceOf(RefreshTokenReuseError);
      expect(err.message).toMatch(/already used/);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('reuse INSIDE the grace window with a foreign-user blob → 401', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = { ...(await issuedPair()), userId: 99 };
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: true,
        revokedAt: new Date(Date.now() - 5 * 1000),
        userId: 42,
        tokenType: 'refresh',
        replacementCiphertext: service.encryptReplacement(pair),
      });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err).not.toBeInstanceOf(RefreshTokenReuseError);
      // No child lookup for a blob that does not belong to this user.
      expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);
    });

    it('reuse INSIDE the grace window without a stored pair (settled legacy row) → 401 only, no waiting', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: true,
        revokedAt: new Date(Date.now() - 20 * 1000), // long past settle time
        userId: 42,
        tokenType: 'refresh',
        replacementCiphertext: null,
      });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err).not.toBeInstanceOf(RefreshTokenReuseError);
      expect(err.message).toMatch(/already used/);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      // No re-reads: a row revoked that long ago will not gain a pair.
      expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);
    });

    it('reuse INSIDE the grace window while the winner is still minting → waits, then replays', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = await issuedPair();
      prismaMock.session.findUnique
        // row already revoked a moment ago, pair not stored yet
        .mockResolvedValueOnce({
          revoked: true,
          revokedAt: new Date(Date.now() - 50),
          userId: 42,
          tokenType: 'refresh',
          replacementCiphertext: null,
        })
        // first re-read: still nothing
        .mockResolvedValueOnce({ replacementCiphertext: null })
        // second re-read: winner stored it
        .mockResolvedValueOnce({
          replacementCiphertext: service.encryptReplacement(pair),
        })
        // child row lookup
        .mockResolvedValueOnce({
          revoked: false,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          tokenType: 'refresh',
        });

      const replayed = await service.rotateRefreshToken(token);

      expect(replayed).toEqual(pair);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(createdSessions).toEqual([]);
    });

    it('reuse OUTSIDE the grace window → revokes ALL user sessions and throws RefreshTokenReuseError', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = await issuedPair();
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: true,
        revokedAt: new Date(Date.now() - 400 * 1000), // past the 300 s default
        userId: 42,
        tokenType: 'refresh',
        // Even with a stored pair, outside the window it must NOT be replayed.
        replacementCiphertext: service.encryptReplacement(pair),
      });
      prismaMock.session.updateMany.mockResolvedValue({ count: 3 });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).toBeInstanceOf(RefreshTokenReuseError);
      expect(err.userId).toBe(42);
      // Family revoke: every non-revoked token of the user.
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 42, revoked: false },
        }),
      );
      // No replacement pair was issued, and the stored one was not replayed.
      expect(createdSessions.filter((s) => s.tokenType !== 'refresh')).toEqual(
        [],
      );
      // Stored blobs of the user are wiped as part of the family revoke.
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 42, replacementCiphertext: { not: null } },
          data: { replacementCiphertext: null },
        }),
      );
    });

    it('revokeAllUserTokens nulls stored replacement pairs before revoking', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 2 });

      await service.revokeAllUserTokens(42);

      const calls = prismaMock.session.updateMany.mock.calls.map((c) => c[0]);
      expect(calls[0]).toEqual({
        where: { userId: 42, replacementCiphertext: { not: null } },
        data: { replacementCiphertext: null },
      });
      expect(calls[1]).toEqual(
        expect.objectContaining({ where: { userId: 42, revoked: false } }),
      );
    });

    it('a lost claim replays the pair once the winner has stored it', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const pair = await issuedPair();
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          revoked: false,
          revokedAt: null,
          userId: 42,
          tokenType: 'refresh',
          replacementCiphertext: null,
        })
        // first re-read: winner has not stored yet
        .mockResolvedValueOnce({ replacementCiphertext: null })
        // second re-read: stored
        .mockResolvedValueOnce({
          replacementCiphertext: service.encryptReplacement(pair),
        })
        // child row lookup
        .mockResolvedValueOnce({
          revoked: false,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          tokenType: 'refresh',
        });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });

      const replayed = await service.rotateRefreshToken(token);

      expect(replayed).toEqual(pair);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(createdSessions).toEqual([]);
    });

    it('replacement blob round-trips, and a tampered or foreign blob decrypts to null', async () => {
      const pair = await issuedPair();
      const blob = service.encryptReplacement(pair);

      expect(service.decryptReplacement(blob)).toEqual(pair);
      expect(blob.split('.')).toHaveLength(3);
      expect(blob).not.toContain(pair.refreshToken);

      const [iv, tag, ct] = blob.split('.');
      const flipped = Buffer.from(ct, 'base64');
      flipped[0] ^= 0xff;
      expect(
        service.decryptReplacement(
          [iv, tag, flipped.toString('base64')].join('.'),
        ),
      ).toBeNull();
      expect(service.decryptReplacement('garbage')).toBeNull();
      expect(service.decryptReplacement('')).toBeNull();

      process.env.JWT_SECRET = 'a-different-secret';
      expect(service.decryptReplacement(blob)).toBeNull();
      process.env.JWT_SECRET = TEST_SECRET;
    });

    it('honours REFRESH_TOKEN_REUSE_GRACE_SECONDS', async () => {
      process.env.REFRESH_TOKEN_REUSE_GRACE_SECONDS = '600';
      const { token } = await service.generateRefreshToken(buildUser() as any);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: true,
        revokedAt: new Date(Date.now() - 120 * 1000), // 2 min ago, inside 10 min
        userId: 42,
        tokenType: 'refresh',
      });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).not.toBeInstanceOf(RefreshTokenReuseError);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('treats a lost race with nothing to replay as an in-grace reuse (401, no family revoke)', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        revoked: false,
        revokedAt: null,
        userId: 42,
        tokenType: 'refresh',
        replacementCiphertext: null,
      });
      // Every re-read finds no stored pair.
      prismaMock.session.findUnique.mockResolvedValue({
        replacementCiphertext: null,
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });

      const err = await service.rotateRefreshToken(token).catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err).not.toBeInstanceOf(RefreshTokenReuseError);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('expiration boundaries', () => {
    it('keeps the refresh token valid after the access token has expired', async () => {
      const access = await service.generateAccessToken(buildUser() as any);
      const refresh = await service.generateRefreshToken(buildUser() as any);
      const accessPayload = decode(access.token);

      expect(() =>
        jwtService.verify(access.token, {
          clockTimestamp: (accessPayload.iat as number) + 16 * 60,
        }),
      ).toThrow();
      expect(
        jwtService.verify<IJwtPayload>(refresh.token, {
          clockTimestamp: (accessPayload.iat as number) + 16 * 60,
        }).sub,
      ).toBe(42);
    });

    it('rejects the refresh token after its original fixed 30-day expiry', async () => {
      const { token } = await service.generateRefreshToken(buildUser() as any);
      const payload = decode(token);

      expect(() =>
        jwtService.verify(token, {
          clockTimestamp: (payload.iat as number) + 30 * 24 * 60 * 60 + 1,
        }),
      ).toThrow();
    });
  });

  describe('duration validation', () => {
    it('throws on a zero duration', async () => {
      process.env.JWT_REFRESH_EXPIRATION = '0d';
      await expect(
        service.generateRefreshToken(buildUser() as any),
      ).rejects.toThrow(/Invalid duration format/);
    });
    it('throws on an invalid access duration format', async () => {
      process.env.JWT_ACCESS_EXPIRATION = 'not-a-duration';
      await expect(
        service.generateAccessToken(buildUser() as any),
      ).rejects.toThrow(/Invalid duration format/);
    });

    it('throws on an invalid refresh duration format', async () => {
      process.env.JWT_REFRESH_EXPIRATION = '30x';
      await expect(
        service.generateRefreshToken(buildUser() as any),
      ).rejects.toThrow(/Invalid duration format/);
    });
  });
});
