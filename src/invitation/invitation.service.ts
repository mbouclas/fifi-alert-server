import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  Invitation,
  InvitationAcceptedVia,
  InvitationStatus,
  Prisma,
} from '@prisma-lib/client';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';
import { PrismaService } from '../services/prisma.service';
import { LanguageService } from '../i18n/language.service';
import {
  AUTH_EVENT_NAMES,
  type IEmailVerifiedPayload,
  type IUserRegisteredPayload,
} from '../auth/auth-events';
import type { ITokenUser } from '../auth/services/token.service';
import {
  buildInviteAcceptUrl,
  getInvitationConfig,
  IInvitationConfig,
} from '../config/invitation.config';
import {
  CreateInvitationDto,
  InvitationDto,
  InvitationPreviewDto,
  InvitationStatsDto,
} from './dto';
import {
  toInvitationDto,
  toInvitationPreviewDto,
  senderDisplayName,
} from './invitation.mapper';
import {
  countPlaceholders,
  escapeHtml,
  INVITE_LINK_PLACEHOLDER,
  normalizeText,
  plainTextErrors,
  renderInvitationHtmlBody,
  renderInvitationTextBody,
} from './invitation-text';
import {
  hashInviteToken,
  isPlausibleInviteToken,
  mintInviteToken,
} from './invitation-token';
import { getInvitationChrome } from './invitation.locale';

const invitationEmailTemplates: Record<string, IEmailTemplate> = {
  invitation: {
    // Subject is per-send (comes from the client); we never use sendHtml().
    subject: 'FiFi Alert invitation',
    file: 'notifications/email/invitation/invitation.njk',
  },
};

export type SendOutcome = 'queued' | 'sent' | 'failed';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * "Invite a friend" (BACKEND_WORK_ORDER_INVITATIONS.md).
 *
 * - The web app renders subject/body; we validate, store the TEMPLATE (with the
 *   `{inviteLink}` placeholder), mint a token, and send after the row commits.
 * - Conversion is recorded from auth domain events: by token when a new account
 *   is registered, by email match once the address is verified (immediately for
 *   provider-verified social signups). Handlers only touch PENDING rows, so they
 *   are idempotent and never block signup.
 */
@Injectable()
export class InvitationService implements OnModuleInit {
  private readonly logger = new Logger(InvitationService.name);
  private readonly config: IInvitationConfig = getInvitationConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
    private readonly languageService: LanguageService,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.warn(
        'Invitations disabled: INVITE_BASE_URL is not set (all /invitations endpoints answer 503)',
      );
      return;
    }
    this.logger.log(
      `Invitations enabled: base=${this.config.baseUrl} ttl=${this.config.ttlDays}d daily=${this.config.dailyLimit} cooldown=${this.config.resendCooldownMinutes}m global/h=${this.config.globalHourlyLimit || 'off'}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  /** Work order §3.0: unset INVITE_BASE_URL → 503 on every endpoint. */
  assertConfigured(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Invitations not configured');
    }
  }

  private conflict(code: 'already_registered' | 'invite_pending'): never {
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      message:
        code === 'already_registered'
          ? 'Recipient already has an account'
          : 'An invitation to this address is already pending',
      error: 'Conflict',
      code,
    });
  }

  private tooMany(message: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private static isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  /** PENDING past expires_at → EXPIRED, scoped to one sender when given. */
  private async sweepExpired(senderUserId?: number): Promise<void> {
    await this.prisma.invitation.updateMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
        ...(senderUserId !== undefined ? { senderUserId } : {}),
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  /**
   * Rolling-window limits. Sends that failed synchronously at the provider
   * are NOT counted: an SMTP outage must not burn the sender's quota. The
   * per-minute throttler still bounds how fast anyone can retry.
   */
  private async enforceSendLimits(senderUserId: number): Promise<void> {
    const now = Date.now();
    const notFailed = { outcome: { not: 'failed' } };
    const daily = await this.prisma.invitationSendLog.count({
      where: {
        senderUserId,
        sentAt: { gt: new Date(now - DAY_MS) },
        ...notFailed,
      },
    });
    if (daily >= this.config.dailyLimit) {
      this.tooMany('Daily invitation limit reached');
    }
    if (this.config.globalHourlyLimit > 0) {
      const hourly = await this.prisma.invitationSendLog.count({
        where: { sentAt: { gt: new Date(now - HOUR_MS) }, ...notFailed },
      });
      if (hourly >= this.config.globalHourlyLimit) {
        this.logger.warn(
          `Global invitation cap hit (${hourly}/${this.config.globalHourlyLimit} per hour) — sender ${senderUserId} refused`,
        );
        this.tooMany(
          'Invitations are temporarily unavailable, try again later',
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // §3.1 create + send
  // ---------------------------------------------------------------------------

  async create(
    sender: ITokenUser,
    dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    this.assertConfigured();

    const subject = normalizeText(dto.subject);
    const body = normalizeText(dto.body);
    const locale = LanguageService.normalizeCode(dto.locale);

    const errors: string[] = [];
    if (!locale || !(await this.languageService.isActiveCode(locale))) {
      errors.push('locale must be a supported language code');
    }
    errors.push(...plainTextErrors('subject', subject, 1, 200));
    errors.push(...plainTextErrors('body', body, 1, 4000));
    if (countPlaceholders(body) !== 1) {
      errors.push(`body must contain exactly one ${INVITE_LINK_PLACEHOLDER}`);
    }
    const recipientEmail = dto.recipientEmail.trim().toLowerCase();
    if (recipientEmail === (sender.email ?? '').toLowerCase()) {
      errors.push('recipientEmail must not be your own address');
    }
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: recipientEmail },
      select: { id: true },
    });
    if (existingUser) {
      this.conflict('already_registered');
    }

    const pending = await this.prisma.invitation.findFirst({
      where: {
        senderUserId: sender.id,
        recipientEmail,
        status: InvitationStatus.PENDING,
      },
      select: { id: true },
    });
    if (pending) {
      this.conflict('invite_pending');
    }

    await this.enforceSendLimits(sender.id);

    const rawToken = mintInviteToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlDays * DAY_MS);

    let created: { invitation: Invitation; logId: number };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.create({
          data: {
            senderUserId: sender.id,
            recipientEmail,
            recipientName: dto.recipientName ?? null,
            locale: locale as string,
            subject,
            body,
            message: dto.message ?? null,
            tokenHash: hashInviteToken(rawToken),
            status: InvitationStatus.PENDING,
            createdAt: now,
            sentAt: now,
            expiresAt,
          },
        });
        const log = await tx.invitationSendLog.create({
          data: {
            invitationId: invitation.id,
            senderUserId: sender.id,
            recipientHash: hashInviteToken(recipientEmail),
            sentAt: now,
            outcome: 'queued',
          },
          select: { id: true },
        });
        return { invitation, logId: log.id };
      });
    } catch (error) {
      if (InvitationService.isUniqueViolation(error)) {
        // Lost the race against a concurrent create: partial unique index.
        this.conflict('invite_pending');
      }
      throw error;
    }

    this.queueDelivery(
      created.invitation,
      rawToken,
      dto.recipientEmail.trim(),
      created.logId,
    );
    return toInvitationDto(created.invitation);
  }

  // ---------------------------------------------------------------------------
  // §3.2 list, §3.7 stats
  // ---------------------------------------------------------------------------

  async list(
    senderUserId: number,
    limit: number,
    offset: number,
  ): Promise<InvitationDto[]> {
    this.assertConfigured();
    await this.sweepExpired(senderUserId);
    const rows = await this.prisma.invitation.findMany({
      where: { senderUserId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    });
    return rows.map(toInvitationDto);
  }

  async stats(senderUserId: number): Promise<InvitationStatsDto> {
    this.assertConfigured();
    await this.sweepExpired(senderUserId);
    const groups = await this.prisma.invitation.groupBy({
      by: ['status'],
      where: { senderUserId },
      _count: { _all: true },
    });
    const count = (status: InvitationStatus) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;
    return {
      sent: groups.reduce((sum, g) => sum + g._count._all, 0),
      accepted: count(InvitationStatus.ACCEPTED),
      pending: count(InvitationStatus.PENDING),
    };
  }

  // ---------------------------------------------------------------------------
  // §3.5 anonymous link validation (read-only)
  // ---------------------------------------------------------------------------

  async preview(rawToken: string): Promise<InvitationPreviewDto> {
    this.assertConfigured();
    if (!isPlausibleInviteToken(rawToken)) {
      throw new NotFoundException('Invitation not found or no longer valid');
    }
    const row = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashInviteToken(rawToken) },
      include: {
        sender: { select: { firstName: true, lastName: true, name: true } },
      },
    });
    if (
      !row ||
      row.status !== InvitationStatus.PENDING ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      // Never reveal which (unknown / expired / revoked / accepted).
      throw new NotFoundException('Invitation not found or no longer valid');
    }
    return toInvitationPreviewDto(row, row.sender);
  }

  // ---------------------------------------------------------------------------
  // §3.3 withdraw, §3.4 resend
  // ---------------------------------------------------------------------------

  private async findOwned(
    senderUserId: number,
    id: number,
  ): Promise<Invitation> {
    const row = Number.isInteger(id)
      ? await this.prisma.invitation.findFirst({
          where: { id, senderUserId },
        })
      : null;
    if (!row) {
      // Owner-only: another sender's row is a 404, never a 403.
      throw new NotFoundException('Invitation not found');
    }
    return row;
  }

  async revoke(senderUserId: number, id: number): Promise<void> {
    this.assertConfigured();
    const row = await this.findOwned(senderUserId, id);
    if (row.status !== InvitationStatus.PENDING) {
      throw new UnprocessableEntityException(
        'Only pending invitations can be withdrawn',
      );
    }
    await this.prisma.invitation.update({
      where: { id: row.id },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
  }

  async resend(senderUserId: number, id: number): Promise<InvitationDto> {
    this.assertConfigured();
    const row = await this.findOwned(senderUserId, id);
    if (
      row.status === InvitationStatus.ACCEPTED ||
      row.status === InvitationStatus.REVOKED
    ) {
      throw new UnprocessableEntityException(
        'Invitation can no longer be resent',
      );
    }
    // The recipient may have registered since the invite went out. Same
    // answer as on create so the web shows "already has an account".
    const registered = await this.prisma.user.findUnique({
      where: { email: row.recipientEmail },
      select: { id: true },
    });
    if (registered) {
      this.conflict('already_registered');
    }

    // Cooldown counts from the last send that actually left the building; a
    // provider failure (row flipped to EXPIRED) must not lock the sender out.
    const lastSend = await this.prisma.invitationSendLog.findFirst({
      where: { invitationId: row.id },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      select: { outcome: true },
    });
    const cooldownMs = this.config.resendCooldownMinutes * 60 * 1000;
    if (
      lastSend?.outcome !== 'failed' &&
      Date.now() - row.sentAt.getTime() < cooldownMs
    ) {
      this.tooMany('Please wait before resending this invitation');
    }
    await this.enforceSendLimits(senderUserId);

    const rawToken = mintInviteToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlDays * DAY_MS);

    let updated: { invitation: Invitation; logId: number };
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.update({
          where: { id: row.id },
          data: {
            tokenHash: hashInviteToken(rawToken),
            status: InvitationStatus.PENDING,
            sentAt: now,
            expiresAt,
          },
        });
        const log = await tx.invitationSendLog.create({
          data: {
            invitationId: invitation.id,
            senderUserId,
            recipientHash: hashInviteToken(invitation.recipientEmail),
            sentAt: now,
            outcome: 'queued',
          },
          select: { id: true },
        });
        return { invitation, logId: log.id };
      });
    } catch (error) {
      if (InvitationService.isUniqueViolation(error)) {
        // An EXPIRED row cannot go back to PENDING while a newer PENDING
        // invite to the same address exists.
        this.conflict('invite_pending');
      }
      throw error;
    }

    this.queueDelivery(
      updated.invitation,
      rawToken,
      updated.invitation.recipientEmail,
      updated.logId,
    );
    return toInvitationDto(updated.invitation);
  }

  // ---------------------------------------------------------------------------
  // Delivery (after commit, never awaited by the request)
  // ---------------------------------------------------------------------------

  private queueDelivery(
    invitation: Invitation,
    rawToken: string,
    toAddress: string,
    logId: number,
  ): void {
    // setImmediate: let the response flush before touching SMTP.
    setImmediate(() => {
      void this.deliver(invitation, rawToken, toAddress, logId).catch(
        (error) => {
          this.logger.error(
            `Unhandled invitation delivery error for invitation ${invitation.id}: ${String(error)}`,
          );
        },
      );
    });
  }

  /**
   * Render + send one invitation email. Synchronous provider failures flip
   * the row to EXPIRED so the sender can resend; asynchronous bounces are not
   * observable with the current providers.
   */
  async deliver(
    invitation: Invitation,
    rawToken: string,
    toAddress: string,
    logId: number,
  ): Promise<boolean> {
    const sender = await this.prisma.user.findUnique({
      where: { id: invitation.senderUserId },
      select: { firstName: true, lastName: true, name: true },
    });
    const senderName = senderDisplayName(sender ?? {});
    const link = buildInviteAcceptUrl(this.config.baseUrl, rawToken);
    const chrome = getInvitationChrome(invitation.locale);

    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      invitationEmailTemplates,
    );

    try {
      const html = await emailService.loadTemplate('invitation', {
        subject: escapeHtml(invitation.subject),
        bodyHtml: renderInvitationHtmlBody(invitation.body, link),
        chrome,
        receivedBecause: escapeHtml(
          chrome.receivedBecause.replace('{senderName}', senderName),
        ),
        year: new Date().getFullYear(),
      });

      await emailService.send({
        from: this.config.from,
        to: toAddress,
        subject: invitation.subject,
        html,
        text: renderInvitationTextBody(invitation.body, link),
      });

      await this.prisma.invitationSendLog.update({
        where: { id: logId },
        data: { outcome: 'sent' },
      });
      this.logger.log(
        `Invitation ${invitation.id} sent (sender ${invitation.senderUserId}, recipient ${hashInviteToken(invitation.recipientEmail).slice(0, 16)})`,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Invitation ${invitation.id} send FAILED (sender ${invitation.senderUserId}, recipient ${hashInviteToken(invitation.recipientEmail).slice(0, 16)}): ${message}`,
      );
      await this.prisma.$transaction([
        this.prisma.invitationSendLog.update({
          where: { id: logId },
          data: { outcome: 'failed', error: message.slice(0, 500) },
        }),
        // Only if still the same PENDING send; a concurrent revoke wins.
        this.prisma.invitation.updateMany({
          where: {
            id: invitation.id,
            status: InvitationStatus.PENDING,
            tokenHash: invitation.tokenHash,
          },
          data: { status: InvitationStatus.EXPIRED },
        }),
      ]);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // §3.6 conversion hooks (bookkeeping only; must never throw into auth)
  // ---------------------------------------------------------------------------

  @OnEvent(AUTH_EVENT_NAMES.USER_REGISTERED, { async: true })
  async handleUserRegistered(payload: IUserRegisteredPayload): Promise<void> {
    try {
      const userId = Number(payload.user.id);
      if (!Number.isInteger(userId)) return;

      if (isPlausibleInviteToken(payload.inviteToken)) {
        const byToken = await this.acceptByToken(payload.inviteToken, userId);
        if (byToken > 0) {
          this.logger.log(
            `Invitation accepted by token for new user ${userId} (${payload.source})`,
          );
        }
      }

      // Email match only once the address is proven. Social providers verify
      // it for us; email/password signups wait for EMAIL_VERIFIED.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true },
      });
      if (user?.emailVerified) {
        await this.acceptByEmail(user.email, userId);
      }
    } catch (error) {
      this.logger.error(
        `Invitation conversion failed for USER_REGISTERED: ${String(error)}`,
      );
    }
  }

  @OnEvent(AUTH_EVENT_NAMES.EMAIL_VERIFIED, { async: true })
  async handleEmailVerified(payload: IEmailVerifiedPayload): Promise<void> {
    try {
      const userId = Number(payload.user.id);
      if (!Number.isInteger(userId) || !payload.user.email) return;
      await this.acceptByEmail(payload.user.email, userId);
    } catch (error) {
      this.logger.error(
        `Invitation conversion failed for EMAIL_VERIFIED: ${String(error)}`,
      );
    }
  }

  /** PENDING + unexpired row with this token → ACCEPTED/TOKEN. Returns rows changed. */
  async acceptByToken(rawToken: string, userId: number): Promise<number> {
    const now = new Date();
    const result = await this.prisma.invitation.updateMany({
      where: {
        tokenHash: hashInviteToken(rawToken),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedVia: InvitationAcceptedVia.TOKEN,
        acceptedAt: now,
        convertedUserId: userId,
      },
    });
    return result.count;
  }

  /** Every PENDING + unexpired row addressed to this email → ACCEPTED/EMAIL. */
  async acceptByEmail(email: string, userId: number): Promise<number> {
    const now = new Date();
    const result = await this.prisma.invitation.updateMany({
      where: {
        recipientEmail: email.trim().toLowerCase(),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedVia: InvitationAcceptedVia.EMAIL,
        acceptedAt: now,
        convertedUserId: userId,
      },
    });
    if (result.count > 0) {
      this.logger.log(
        `${result.count} invitation(s) accepted by email match for user ${userId}`,
      );
    }
    return result.count;
  }
}
