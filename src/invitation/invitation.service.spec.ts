/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvitationStatus, Prisma } from '@prisma-lib/client';
import { InvitationService } from './invitation.service';
import { PrismaService } from '../services/prisma.service';
import { LanguageService } from '../i18n/language.service';
import { hashInviteToken } from './invitation-token';
import type { ITokenUser } from '../auth/services/token.service';

const sender: ITokenUser = {
  id: 7,
  email: 'maria@example.test',
  name: 'Maria Papa',
  roles: [],
  gates: [],
} as unknown as ITokenUser;

const validDto = {
  recipientEmail: 'Nikos@Example.test',
  recipientName: 'Nikos',
  locale: 'el',
  subject: 'Πρόσκληση',
  body: 'Γεια σου Nikos,\n\nΕδώ:\n{inviteLink}\n\nΓεια',
};

function row(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-10-17T10:00:00Z');
  return {
    id: 1042,
    senderUserId: 7,
    recipientEmail: 'nikos@example.test',
    recipientName: 'Nikos',
    locale: 'el',
    subject: 's',
    body: 'b {inviteLink}',
    message: null,
    tokenHash: 'h'.repeat(64),
    status: InvitationStatus.PENDING,
    acceptedVia: null,
    createdAt: now,
    sentAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    acceptedAt: null,
    revokedAt: null,
    convertedUserId: null,
    ...overrides,
  };
}

describe('InvitationService', () => {
  let service: InvitationService;
  let prisma: Record<string, any>;
  let emailProvider: { send: jest.Mock };
  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env.INVITE_BASE_URL = 'https://app.test';
    process.env.MAIL_NOTIFICATIONS_FROM = 'no-reply@test';

    prisma = {
      user: { findUnique: jest.fn() },
      invitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn(),
      },
      invitationSendLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ outcome: 'sent' }),
      },
      $transaction: jest.fn(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    emailProvider = {
      send: jest.fn().mockResolvedValue({ id: 'm', message: 'ok' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: 'IEmailProvider', useValue: emailProvider },
        {
          provide: LanguageService,
          useValue: {
            isActiveCode: jest.fn(async (c: string) =>
              ['el', 'en'].includes(c),
            ),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(InvitationService);
    // Keep delivery out of the unit tests; it is exercised separately below.
    jest
      .spyOn(service as any, 'queueDelivery')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    jest.restoreAllMocks();
  });

  describe('configuration gate', () => {
    it('answers 503 on every operation when INVITE_BASE_URL is unset', async () => {
      delete process.env.INVITE_BASE_URL;
      const moduleRef = await Test.createTestingModule({
        providers: [
          InvitationService,
          { provide: PrismaService, useValue: prisma },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: 'IEmailProvider', useValue: emailProvider },
          { provide: LanguageService, useValue: { isActiveCode: jest.fn() } },
        ],
      }).compile();
      const disabled = moduleRef.get(InvitationService);
      await expect(disabled.create(sender, validDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(disabled.list(7, 50, 0)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(disabled.stats(7)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(disabled.preview('abc')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(disabled.revoke(7, 1)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(disabled.resend(7, 1)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('create', () => {
    it('lists every failing rule in one 400', async () => {
      await expect(
        service.create(sender, {
          ...validDto,
          locale: 'xx',
          subject: '<b>hi</b>',
          body: 'no link {inviteLink} {inviteLink}',
          recipientEmail: 'MARIA@example.test',
        }),
      ).rejects.toMatchObject({
        response: {
          message: expect.arrayContaining([
            'locale must be a supported language code',
            'subject must be plain text (no HTML tags)',
            'body must contain exactly one {inviteLink}',
            'recipientEmail must not be your own address',
          ]),
        },
      });
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('400 when the placeholder is missing', async () => {
      await expect(
        service.create(sender, { ...validDto, body: 'hello' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('409 already_registered when the address has an account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 99 });
      await expect(service.create(sender, validDto)).rejects.toMatchObject({
        response: { code: 'already_registered', statusCode: 409 },
      });
    });

    it('409 invite_pending when an open invite exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.create(sender, validDto)).rejects.toMatchObject({
        response: { code: 'invite_pending' },
      });
    });

    it('429 at the daily limit (default 20), counting the send log', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitationSendLog.count.mockResolvedValueOnce(20);
      await expect(service.create(sender, validDto)).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.invitationSendLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          senderUserId: 7,
          outcome: { not: 'failed' },
        }),
      });
    });

    it('stores lower-cased email, the template with the placeholder, a sha256 hash, and returns the DTO without secrets', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockImplementation(async ({ data }: any) =>
        row({ ...data, id: 1042 }),
      );

      const dto = await service.create(sender, validDto);

      const data = prisma.invitation.create.mock.calls[0][0].data;
      expect(data.recipientEmail).toBe('nikos@example.test');
      expect(data.body).toContain('{inviteLink}');
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.status).toBe(InvitationStatus.PENDING);
      expect(prisma.invitationSendLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderUserId: 7, outcome: 'queued' }),
        }),
      );
      expect((service as any).queueDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        'Nikos@Example.test',
        1,
      );
      expect(dto).toEqual({
        id: '1042',
        recipientEmail: 'nikos@example.test',
        recipientName: 'Nikos',
        locale: 'el',
        status: 'pending',
        createdAt: expect.any(String),
        sentAt: expect.any(String),
        expiresAt: expect.any(String),
        acceptedAt: null,
        acceptedVia: null,
      });
      expect(dto).not.toHaveProperty('subject');
      expect(dto).not.toHaveProperty('body');
      expect(dto).not.toHaveProperty('tokenHash');
      expect(dto).not.toHaveProperty('convertedUserId');
    });

    it('maps a unique-index race to 409 invite_pending', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(service.create(sender, validDto)).rejects.toMatchObject({
        response: { code: 'invite_pending' },
      });
    });
  });

  describe('list / stats', () => {
    it('sweeps expired rows for the caller then lists newest first', async () => {
      prisma.invitation.findMany.mockResolvedValue([row()]);
      const out = await service.list(7, 50, 0);
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InvitationStatus.PENDING,
            senderUserId: 7,
          }),
          data: { status: InvitationStatus.EXPIRED },
        }),
      );
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { senderUserId: 7 },
          take: 50,
          skip: 0,
        }),
      );
      expect(out[0].id).toBe('1042');
    });

    it('aggregates stats from groupBy', async () => {
      prisma.invitation.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 6 } },
        { status: 'ACCEPTED', _count: { _all: 4 } },
        { status: 'EXPIRED', _count: { _all: 2 } },
      ]);
      expect(await service.stats(7)).toEqual({
        sent: 12,
        accepted: 4,
        pending: 6,
      });
    });
  });

  describe('preview', () => {
    it('returns exactly five fields for a pending unexpired token', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...row(),
        sender: { firstName: 'Maria', lastName: 'Papa', name: 'mp' },
      });
      const out = await service.preview('tok');
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashInviteToken('tok') },
        }),
      );
      expect(out).toEqual({
        valid: true,
        recipientEmail: 'nikos@example.test',
        recipientName: 'Nikos',
        locale: 'el',
        senderName: 'Maria Papa',
      });
      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      ['revoked', { ...row({ status: InvitationStatus.REVOKED }), sender: {} }],
      [
        'accepted',
        { ...row({ status: InvitationStatus.ACCEPTED }), sender: {} },
      ],
      ['expired by time', { ...row({ expiresAt: new Date(0) }), sender: {} }],
    ])('404 for %s', async (_label, found) => {
      prisma.invitation.findUnique.mockResolvedValue(found);
      await expect(service.preview('tok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 for implausible tokens without touching the DB', async () => {
      await expect(service.preview('has space')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it("404 for another sender's row", async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);
      await expect(service.revoke(7, 1042)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
        where: { id: 1042, senderUserId: 7 },
      });
    });

    it('422 when not pending', async () => {
      prisma.invitation.findFirst.mockResolvedValue(
        row({ status: InvitationStatus.ACCEPTED }),
      );
      await expect(service.revoke(7, 1042)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('sets REVOKED + revokedAt', async () => {
      prisma.invitation.findFirst.mockResolvedValue(row());
      await service.revoke(7, 1042);
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 1042 },
        data: { status: InvitationStatus.REVOKED, revokedAt: expect.any(Date) },
      });
    });
  });

  describe('resend', () => {
    it('409 already_registered when the recipient signed up meanwhile', async () => {
      prisma.invitation.findFirst.mockResolvedValue(
        row({ sentAt: new Date(Date.now() - 2 * 3600000) }),
      );
      prisma.user.findUnique.mockResolvedValue({ id: 99 });
      await expect(service.resend(7, 1042)).rejects.toMatchObject({
        response: { code: 'already_registered' },
      });
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('skips the cooldown when the last send failed at the provider', async () => {
      const old = row({ status: InvitationStatus.EXPIRED, sentAt: new Date() });
      prisma.invitation.findFirst.mockResolvedValue(old);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitationSendLog.findFirst.mockResolvedValue({
        outcome: 'failed',
      });
      prisma.invitation.update.mockImplementation(async ({ data }: any) => ({
        ...old,
        ...data,
      }));
      const dto = await service.resend(7, 1042);
      expect(dto.status).toBe('pending');
    });

    it('422 for accepted/revoked', async () => {
      prisma.invitation.findFirst.mockResolvedValue(
        row({ status: InvitationStatus.REVOKED }),
      );
      await expect(service.resend(7, 1042)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('429 inside the cooldown', async () => {
      prisma.invitation.findFirst.mockResolvedValue(
        row({ sentAt: new Date() }),
      );
      await expect(service.resend(7, 1042)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('mints a new token, resets status/sentAt/expiresAt and logs the send', async () => {
      const old = row({
        status: InvitationStatus.EXPIRED,
        sentAt: new Date(Date.now() - 2 * 3600000),
      });
      prisma.invitation.findFirst.mockResolvedValue(old);
      prisma.invitation.update.mockImplementation(async ({ data }: any) => ({
        ...old,
        ...data,
      }));

      const dto = await service.resend(7, 1042);

      const data = prisma.invitation.update.mock.calls[0][0].data;
      expect(data.tokenHash).not.toBe(old.tokenHash);
      expect(data.status).toBe(InvitationStatus.PENDING);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(prisma.invitationSendLog.create).toHaveBeenCalled();
      expect(dto.status).toBe('pending');
    });
  });

  describe('conversion hooks', () => {
    it('token match marks ACCEPTED/TOKEN with the new user id; email match waits for verification', async () => {
      prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({
        email: 'nikos@example.test',
        emailVerified: false,
      });

      await service.handleUserRegistered({
        user: { id: '55', email: 'nikos@example.test' },
        source: 'signup',
        inviteToken: 'abcDEF123_-',
      });

      expect(prisma.invitation.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tokenHash: hashInviteToken('abcDEF123_-'),
            status: InvitationStatus.PENDING,
          }),
          data: expect.objectContaining({
            status: InvitationStatus.ACCEPTED,
            acceptedVia: 'TOKEN',
            convertedUserId: 55,
          }),
        }),
      );
    });

    it('provider-verified social signup also runs the email match immediately', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'Nikos@example.test',
        emailVerified: true,
      });
      await service.handleUserRegistered({
        user: { id: 56, email: 'x' },
        source: 'social',
      });
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientEmail: 'nikos@example.test',
          }),
          data: expect.objectContaining({
            acceptedVia: 'EMAIL',
            convertedUserId: 56,
          }),
        }),
      );
    });

    it('EMAIL_VERIFIED marks every pending invite to that address', async () => {
      prisma.invitation.updateMany.mockResolvedValue({ count: 2 });
      await service.handleEmailVerified({
        user: { id: 57, email: 'nikos@example.test' },
      });
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientEmail: 'nikos@example.test',
            status: InvitationStatus.PENDING,
          }),
        }),
      );
    });

    it('never throws into auth', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));
      await expect(
        service.handleUserRegistered({
          user: { id: 1, email: 'a' },
          source: 'signup',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('deliver', () => {
    it('sends escaped HTML + text with the link and marks the log sent', async () => {
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Maria',
        lastName: 'Papa',
        name: '',
      });
      const inv = row({
        subject: 'Hi <you>',
        body: 'Line & more\n\nGo:\n{inviteLink}',
      });

      const ok = await service.deliver(
        inv as any,
        'rawTok',
        'Nikos@Example.test',
        1,
      );

      expect(ok).toBe(true);
      const msg = emailProvider.send.mock.calls[0][0];
      expect(msg.to).toBe('Nikos@Example.test');
      expect(msg.from).toBe('no-reply@test');
      expect(msg.subject).toBe('Hi <you>');
      expect(msg.text).toBe(
        'Line & more\n\nGo:\nhttps://app.test/accept-invite?token=rawTok',
      );
      expect(msg.html).toContain('Line &amp; more');
      expect(msg.html).toContain(
        'href="https://app.test/accept-invite?token=rawTok"',
      );
      expect(msg.html).toContain('Maria Papa');
      expect(msg.html).not.toContain('{inviteLink}');
      expect(msg.html).not.toContain('Unsubscribe');
      expect(prisma.invitationSendLog.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { outcome: 'sent' },
      });
    });

    it('on provider failure flips the row to EXPIRED and logs the error', async () => {
      prisma.user.findUnique.mockResolvedValue({});
      emailProvider.send.mockRejectedValue(new Error('SMTP 550'));
      const inv = row();

      const ok = await service.deliver(
        inv as any,
        'rawTok',
        inv.recipientEmail,
        1,
      );

      expect(ok).toBe(false);
      expect(prisma.invitationSendLog.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { outcome: 'failed', error: 'SMTP 550' },
      });
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1042,
            tokenHash: inv.tokenHash,
          }),
          data: { status: InvitationStatus.EXPIRED },
        }),
      );
    });
  });
});
