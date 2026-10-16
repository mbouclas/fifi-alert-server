/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

// Mock @simplewebauthn/server: these tests cover the service's control flow
// and HTTP error mapping, not the cryptography (the web repo's Chrome
// virtual-authenticator e2e covers the real ceremony).
const webauthn = {
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
};
jest.mock('@simplewebauthn/server', () => webauthn);

import {
  PASSKEY_ERRORS,
  PasskeyService,
  normalisePasskeyName,
  toPasskeyDto,
} from '../passkey.service';

const CONFIG = {
  rpId: 'localhost',
  rpName: 'FiFi Alert',
  origins: ['http://localhost:4173'],
  enabled: true,
};

const USER_ID = 7;
const OTHER_USER_ID = 8;

function buildRow(overrides: Partial<any> = {}) {
  return {
    id: 'pk_1',
    userId: USER_ID,
    credentialId: 'cred-abc',
    publicKey: Buffer.from([1, 2, 3]),
    counter: BigInt(5),
    transports: ['internal'],
    aaguid: 'aaguid-1',
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'MacBook',
    createdAt: new Date('2026-10-16T09:00:00.000Z'),
    lastUsedAt: null,
    ...overrides,
  };
}

function buildPrisma() {
  return {
    user: { findUnique: jest.fn() },
    passkey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
}

function buildStore() {
  return { create: jest.fn(), consume: jest.fn() };
}

describe('PasskeyService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let store: ReturnType<typeof buildStore>;
  let service: PasskeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    store = buildStore();
    service = new PasskeyService(prisma as any, store as any, CONFIG);
  });

  describe('configuration gate', () => {
    it('returns 503 on every ceremony endpoint when RP config is missing', async () => {
      const disabled = new PasskeyService(prisma as any, store as any, {
        ...CONFIG,
        enabled: false,
      });
      await expect(disabled.startRegistration(USER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(disabled.startLogin()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(
        disabled.finishLogin({ challengeId: 'x', response: {} }),
      ).rejects.toThrow(PASSKEY_ERRORS.notConfigured);
      expect(store.consume).not.toHaveBeenCalled();
    });
  });

  describe('startRegistration', () => {
    it('requires resident keys, excludes existing credentials and stores a register challenge for the bearer user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.c',
        name: 'Ann',
      });
      prisma.passkey.findMany.mockResolvedValue([
        { credentialId: 'cred-abc', transports: ['internal'] },
      ]);
      webauthn.generateRegistrationOptions.mockResolvedValue({
        challenge: 'chal-1',
        rp: { id: 'localhost', name: 'FiFi Alert' },
      });
      store.create.mockResolvedValue('c_1');

      const result = await service.startRegistration(USER_ID);

      const args = webauthn.generateRegistrationOptions.mock.calls[0][0];
      expect(args.rpID).toBe('localhost');
      expect(args.rpName).toBe('FiFi Alert');
      expect(args.userName).toBe('a@b.c');
      expect(args.authenticatorSelection.residentKey).toBe('required');
      expect(args.authenticatorSelection.requireResidentKey).toBe(true);
      expect(args.authenticatorSelection.userVerification).toBe('preferred');
      expect(args.attestationType).toBe('none');
      expect(args.excludeCredentials).toEqual([
        { id: 'cred-abc', transports: ['internal'] },
      ]);
      expect(args.supportedAlgorithmIDs).toEqual([-7, -257]);
      expect(store.create).toHaveBeenCalledWith({
        challenge: 'chal-1',
        type: 'register',
        userId: USER_ID,
      });
      expect(result).toEqual({
        challengeId: 'c_1',
        options: expect.objectContaining({ challenge: 'chal-1' }),
      });
    });
  });

  describe('finishRegistration', () => {
    const response = { id: 'cred-new', response: { transports: ['hybrid'] } };
    const verified = {
      verified: true,
      registrationInfo: {
        aaguid: 'aaguid-new',
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        credential: {
          id: 'cred-new',
          publicKey: new Uint8Array([9, 9]),
          counter: 0,
          transports: ['hybrid'],
        },
      },
    };

    it.each([
      ['unknown id', null],
      ['login challenge', { challenge: 'c', type: 'login' }],
      [
        'another user',
        { challenge: 'c', type: 'register', userId: OTHER_USER_ID },
      ],
    ])(
      'rejects with 400 "unknown or expired challenge" for %s and never calls the verifier',
      async (_label, stored) => {
        store.consume.mockResolvedValue(stored);
        await expect(
          service.finishRegistration(USER_ID, { challengeId: 'c_x', response }),
        ).rejects.toMatchObject({
          constructor: BadRequestException,
          message: PASSKEY_ERRORS.unknownChallenge,
        });
        expect(webauthn.verifyRegistrationResponse).not.toHaveBeenCalled();
      },
    );

    it('maps a thrown verifier error (origin / RP / signature) to 400 "verification failed"', async () => {
      store.consume.mockResolvedValue({
        challenge: 'c',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockRejectedValue(
        new Error('Unexpected registration response origin'),
      );
      await expect(
        service.finishRegistration(USER_ID, { challengeId: 'c_x', response }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: PASSKEY_ERRORS.verificationFailed,
      });
      expect(prisma.passkey.create).not.toHaveBeenCalled();
    });

    it('maps verified:false to 400 "verification failed"', async () => {
      store.consume.mockResolvedValue({
        challenge: 'c',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockResolvedValue({
        verified: false,
      });
      await expect(
        service.finishRegistration(USER_ID, { challengeId: 'c_x', response }),
      ).rejects.toThrow(PASSKEY_ERRORS.verificationFailed);
    });

    it('passes the stored challenge, configured origins and RP id, and does not require UV', async () => {
      store.consume.mockResolvedValue({
        challenge: 'stored-chal',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockResolvedValue(verified);
      prisma.passkey.findUnique.mockResolvedValue(null);
      prisma.passkey.create.mockResolvedValue(
        buildRow({ id: 'pk_new', credentialId: 'cred-new' }),
      );

      await service.finishRegistration(USER_ID, {
        challengeId: 'c_x',
        response,
      });

      expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith({
        response,
        expectedChallenge: 'stored-chal',
        expectedOrigin: CONFIG.origins,
        expectedRPID: CONFIG.rpId,
        requireUserVerification: false,
      });
    });

    it('returns 409 when the credential id already exists (pre-check)', async () => {
      store.consume.mockResolvedValue({
        challenge: 'c',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockResolvedValue(verified);
      prisma.passkey.findUnique.mockResolvedValue({ id: 'pk_other' });
      await expect(
        service.finishRegistration(USER_ID, { challengeId: 'c_x', response }),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        message: PASSKEY_ERRORS.alreadyRegistered,
      });
    });

    it('returns 409 when the insert races into the unique index (P2002)', async () => {
      store.consume.mockResolvedValue({
        challenge: 'c',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockResolvedValue(verified);
      prisma.passkey.findUnique.mockResolvedValue(null);
      prisma.passkey.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
      await expect(
        service.finishRegistration(USER_ID, { challengeId: 'c_x', response }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stores the credential from registrationInfo with a trimmed, capped name and returns the safe DTO', async () => {
      store.consume.mockResolvedValue({
        challenge: 'c',
        type: 'register',
        userId: USER_ID,
      });
      webauthn.verifyRegistrationResponse.mockResolvedValue(verified);
      prisma.passkey.findUnique.mockResolvedValue(null);
      prisma.passkey.create.mockImplementation(({ data }) =>
        Promise.resolve(
          buildRow({ ...data, id: 'pk_new', createdAt: new Date(0) }),
        ),
      );

      const dto = await service.finishRegistration(USER_ID, {
        challengeId: 'c_x',
        name: `  ${'x'.repeat(80)}  `,
        response,
      });

      const data = prisma.passkey.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        userId: USER_ID,
        credentialId: 'cred-new',
        counter: BigInt(0),
        transports: ['hybrid'],
        aaguid: 'aaguid-new',
        deviceType: 'multiDevice',
        backedUp: true,
      });
      expect(Buffer.isBuffer(data.publicKey)).toBe(true);
      expect(data.name).toHaveLength(64);

      expect(dto).toEqual({
        id: 'pk_new',
        name: 'x'.repeat(64),
        createdAt: '1970-01-01T00:00:00.000Z',
        lastUsedAt: null,
        aaguid: 'aaguid-new',
        deviceType: 'multiDevice',
        backedUp: true,
        transports: ['hybrid'],
      });
      expect(dto).not.toHaveProperty('publicKey');
      expect(dto).not.toHaveProperty('counter');
      expect(dto).not.toHaveProperty('credentialId');
    });
  });

  describe('startLogin', () => {
    it('never names a user: no allowCredentials, anonymous login challenge', async () => {
      webauthn.generateAuthenticationOptions.mockResolvedValue({
        challenge: 'login-chal',
        rpId: 'localhost',
        allowCredentials: [],
      });
      store.create.mockResolvedValue('c_login');

      const result = await service.startLogin();

      const args = webauthn.generateAuthenticationOptions.mock.calls[0][0];
      expect(args.rpID).toBe('localhost');
      expect(args.userVerification).toBe('preferred');
      expect(args.allowCredentials).toEqual([]);
      expect(store.create).toHaveBeenCalledWith({
        challenge: 'login-chal',
        type: 'login',
      });
      expect(store.create.mock.calls[0][0]).not.toHaveProperty('userId');
      expect(result.challengeId).toBe('c_login');
      expect(result.options.allowCredentials).toEqual([]);
    });
  });

  describe('finishLogin', () => {
    const response = { id: 'cred-abc', rawId: 'cred-abc', type: 'public-key' };

    it.each([
      ['unknown id', null],
      ['register challenge', { challenge: 'c', type: 'register', userId: 1 }],
    ])('rejects with 400 for %s', async (_label, stored) => {
      store.consume.mockResolvedValue(stored);
      await expect(
        service.finishLogin({ challengeId: 'c_x', response }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: PASSKEY_ERRORS.unknownChallenge,
      });
      expect(prisma.passkey.findUnique).not.toHaveBeenCalled();
    });

    it('returns 401 "unknown credential" when no passkey matches response.id', async () => {
      store.consume.mockResolvedValue({ challenge: 'c', type: 'login' });
      prisma.passkey.findUnique.mockResolvedValue(null);
      await expect(
        service.finishLogin({ challengeId: 'c_x', response }),
      ).rejects.toMatchObject({
        constructor: UnauthorizedException,
        message: PASSKEY_ERRORS.unknownCredential,
      });
      expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled();
    });

    it('returns 401 "unknown credential" when response.id is missing', async () => {
      store.consume.mockResolvedValue({ challenge: 'c', type: 'login' });
      await expect(
        service.finishLogin({ challengeId: 'c_x', response: {} }),
      ).rejects.toThrow(PASSKEY_ERRORS.unknownCredential);
    });

    it('maps a thrown verifier error, including counter regression, to 401 "verification failed"', async () => {
      store.consume.mockResolvedValue({ challenge: 'c', type: 'login' });
      prisma.passkey.findUnique.mockResolvedValue(buildRow());
      webauthn.verifyAuthenticationResponse.mockRejectedValue(
        new Error('Response counter value 3 was lower than expected 5'),
      );
      await expect(
        service.finishLogin({ challengeId: 'c_x', response }),
      ).rejects.toMatchObject({
        constructor: UnauthorizedException,
        message: PASSKEY_ERRORS.verificationFailed,
      });
      expect(prisma.passkey.update).not.toHaveBeenCalled();
    });

    it('passes the stored credential (Uint8Array key, numeric counter) and does not require UV', async () => {
      store.consume.mockResolvedValue({ challenge: 'stored', type: 'login' });
      prisma.passkey.findUnique.mockResolvedValue(buildRow());
      webauthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6, credentialBackedUp: true },
      });
      prisma.passkey.update.mockResolvedValue(buildRow());

      await service.finishLogin({ challengeId: 'c_x', response });

      const args = webauthn.verifyAuthenticationResponse.mock.calls[0][0];
      expect(args.expectedChallenge).toBe('stored');
      expect(args.expectedOrigin).toEqual(CONFIG.origins);
      expect(args.expectedRPID).toBe(CONFIG.rpId);
      expect(args.requireUserVerification).toBe(false);
      expect(args.credential.id).toBe('cred-abc');
      expect(args.credential.publicKey).toBeInstanceOf(Uint8Array);
      expect(args.credential.counter).toBe(5);
      expect(args.credential.transports).toEqual(['internal']);
    });

    it('on success bumps the counter, stamps lastUsedAt and returns the owner id', async () => {
      store.consume.mockResolvedValue({ challenge: 'c', type: 'login' });
      prisma.passkey.findUnique.mockResolvedValue(buildRow());
      webauthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6, credentialBackedUp: false },
      });
      prisma.passkey.update.mockResolvedValue(buildRow());

      const result = await service.finishLogin({
        challengeId: 'c_x',
        response,
      });

      expect(result).toEqual({ userId: USER_ID, passkeyId: 'pk_1' });
      const update = prisma.passkey.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'pk_1' });
      expect(update.data.counter).toBe(BigInt(6));
      expect(update.data.lastUsedAt).toBeInstanceOf(Date);
    });

    it('consumes the challenge exactly once per attempt, even on failure', async () => {
      store.consume.mockResolvedValue({ challenge: 'c', type: 'login' });
      prisma.passkey.findUnique.mockResolvedValue(null);
      await expect(
        service.finishLogin({ challengeId: 'c_x', response }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(store.consume).toHaveBeenCalledTimes(1);
      expect(store.consume).toHaveBeenCalledWith('c_x');
    });
  });

  describe('management', () => {
    it('list returns newest first as safe DTOs', async () => {
      prisma.passkey.findMany.mockResolvedValue([buildRow()]);
      const result = await service.list(USER_ID);
      expect(prisma.passkey.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0]).not.toHaveProperty('publicKey');
      expect(result[0].createdAt).toBe('2026-10-16T09:00:00.000Z');
    });

    it('countForUser counts only the given user', async () => {
      prisma.passkey.count.mockResolvedValue(2);
      await expect(service.countForUser(USER_ID)).resolves.toBe(2);
      expect(prisma.passkey.count).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it.each(['rename', 'remove'] as const)(
      '%s returns 404 for a passkey that belongs to another user (ownership is part of the lookup)',
      async (op) => {
        prisma.passkey.findFirst.mockResolvedValue(null);
        const call =
          op === 'rename'
            ? service.rename(USER_ID, 'pk_1', 'New')
            : service.remove(USER_ID, 'pk_1');
        await expect(call).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.passkey.findFirst).toHaveBeenCalledWith({
          where: { id: 'pk_1', userId: USER_ID },
        });
        expect(prisma.passkey.update).not.toHaveBeenCalled();
        expect(prisma.passkey.delete).not.toHaveBeenCalled();
      },
    );

    it('rename trims and rejects empty / over-long names with 400 before touching the DB', async () => {
      await expect(
        service.rename(USER_ID, 'pk_1', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.rename(USER_ID, 'pk_1', 'x'.repeat(65)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passkey.findFirst).not.toHaveBeenCalled();

      prisma.passkey.findFirst.mockResolvedValue(buildRow());
      prisma.passkey.update.mockResolvedValue(buildRow({ name: 'Work' }));
      const dto = await service.rename(USER_ID, 'pk_1', '  Work  ');
      expect(prisma.passkey.update).toHaveBeenCalledWith({
        where: { id: 'pk_1' },
        data: { name: 'Work' },
      });
      expect(dto.name).toBe('Work');
    });

    it('remove deletes the owned row', async () => {
      prisma.passkey.findFirst.mockResolvedValue(buildRow());
      prisma.passkey.delete.mockResolvedValue(buildRow());
      await service.remove(USER_ID, 'pk_1');
      expect(prisma.passkey.delete).toHaveBeenCalledWith({
        where: { id: 'pk_1' },
      });
    });
  });

  describe('helpers', () => {
    it('normalisePasskeyName trims, caps at 64 and defaults to "Passkey <date>"', () => {
      expect(normalisePasskeyName('  Phone ')).toBe('Phone');
      expect(normalisePasskeyName('y'.repeat(100))).toHaveLength(64);
      expect(normalisePasskeyName(undefined)).toMatch(
        /^Passkey \d{4}-\d{2}-\d{2}$/,
      );
      expect(normalisePasskeyName('   ')).toMatch(/^Passkey /);
    });

    it('toPasskeyDto exposes exactly the client-facing fields', () => {
      const dto = toPasskeyDto(
        buildRow({ lastUsedAt: new Date('2026-10-16T10:00:00.000Z') }) as any,
      );
      expect(Object.keys(dto).sort()).toEqual(
        [
          'aaguid',
          'backedUp',
          'createdAt',
          'deviceType',
          'id',
          'lastUsedAt',
          'name',
          'transports',
        ].sort(),
      );
      expect(dto.lastUsedAt).toBe('2026-10-16T10:00:00.000Z');
    });
  });
});
