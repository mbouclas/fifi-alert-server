import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';
import { PrismaService } from '../services/prisma.service';

const alertEmailTemplates: Record<string, IEmailTemplate> = {
  newAlert: {
    subject: 'Missing pet near you',
    file: 'notifications/email/alert/newAlert.njk',
  },
};

export type AlertEmailPayload = {
  petName: string;
  petSpecies: string;
  petDescription: string;
  petPhotoUrl?: string;
  locationAddress?: string;
  distanceKm?: number;
  alertId: number;
};

/**
 * Degraded delivery channel for users we cannot push to.
 *
 * Push is the real channel — email is minutes-to-hours late and easy to miss. It
 * exists because on iOS a user who never adds FiFi to their Home Screen cannot
 * receive push at all, and silence is worse than a late email.
 *
 * HIGH confidence only: an email saying "a pet might be somewhere in your city"
 * trains people to ignore us.
 */
@Injectable()
export class AlertEmailService {
  private readonly logger = new Logger(AlertEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
  ) {}

  /**
   * Whether this user has opted in to email fallback.
   * Stored on User.settings so it needs no schema change; defaults to on, since
   * a user with no push channel would otherwise get nothing at all.
   */
  async isOptedIn(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true, emailVerified: true },
    });

    if (!user?.emailVerified) {
      return false;
    }

    const settings =
      user.settings && typeof user.settings === 'object'
        ? (user.settings as Record<string, any>)
        : {};

    return settings.notifications?.email !== false;
  }

  /**
   * Send the fallback alert email.
   *
   * @returns true when the provider accepted the message
   */
  async sendAlertEmail(
    userId: number,
    payload: AlertEmailPayload,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user?.email || !user.emailVerified) {
      return false;
    }

    const emailService = new EmailService(
      this.emailProvider,
      this.eventEmitter,
      alertEmailTemplates,
    );

    try {
      await emailService.sendHtml('newAlert', {
        from: String(process.env.MAIL_NOTIFICATIONS_FROM),
        to: user.email,
        templateData: {
          alert: {
            petName: payload.petName,
            species: payload.petSpecies,
            description: payload.petDescription,
            location: payload.locationAddress ?? '',
            photoUrl: payload.petPhotoUrl ?? '',
            reportSightingUrl: `${process.env.APP_URL}/alerts/${payload.alertId}`,
          },
          distanceKm: payload.distanceKm,
          appUrl: process.env.APP_URL,
        },
      });

      this.logger.log(
        `Fallback alert email sent to user ${userId} for alert ${payload.alertId}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send fallback alert email to user ${userId}:`,
        error,
      );
      return false;
    }
  }
}
