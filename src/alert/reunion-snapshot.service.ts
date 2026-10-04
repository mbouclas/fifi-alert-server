import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getReunionTtlDays } from '@config/reunion.config';
import { PrismaService } from '../services/prisma.service';
import { NotificationStatus, ReunionSnapshot } from '../generated/prisma';
import { ReunionSnapshotDto } from './dto/reunion-snapshot.dto';

/** Notification rows that mean a user actually received the alert (push or email). */
export const DELIVERED_NOTIFICATION_STATUSES: NotificationStatus[] = [
  NotificationStatus.SENT,
  NotificationStatus.DELIVERED,
  NotificationStatus.OPENED,
];

export interface ReunionPetInput {
  tagId: string;
  name: string;
  primaryPhoto: string | null;
  photos: string[];
}

/**
 * Owns the `reunion_snapshot` table: the public "{Pet} is home!" card that
 * backs `/thank-you/{tagId}` (BACKEND_WORK_ORDER_THANK_YOU.md §3.1–3.2).
 */
@Injectable()
export class ReunionSnapshotService {
  private readonly logger = new Logger(ReunionSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Distinct users who received this alert while it was active. Counts push and
   * email rows alike, one per user. Must run before the success-story fan-out
   * adds its own rows for the same alert.
   */
  async countNeighboursNotified(alertId: number): Promise<number> {
    const rows = await this.prisma.notification.findMany({
      where: {
        alert_id: alertId,
        excluded: false,
        status: { in: DELIVERED_NOTIFICATION_STATUSES },
      },
      select: { device: { select: { user_id: true } } },
    });
    return new Set(rows.map((row) => row.device.user_id)).size;
  }

  /**
   * Freeze the public snapshot for a resolved-as-found alert. One row per tag;
   * a later resolve for the same pet replaces it.
   */
  async upsertForResolvedAlert(params: {
    alertId: number;
    pet: ReunionPetInput;
    thankYouMessage?: string | null;
    resolvedAt: Date;
  }): Promise<ReunionSnapshot> {
    const { alertId, pet, resolvedAt } = params;

    const [neighboursNotified, sightingsReported] = await Promise.all([
      this.countNeighboursNotified(alertId),
      this.prisma.sighting.count({ where: { alert_id: alertId } }),
    ]);

    const expiresAt = new Date(
      resolvedAt.getTime() + getReunionTtlDays() * 24 * 60 * 60 * 1000,
    );

    const data = {
      alertId,
      petName: pet.name,
      petPhotoUrl: pet.primaryPhoto ?? pet.photos[0] ?? null,
      thankYouMessage: params.thankYouMessage ?? null,
      resolvedAt,
      neighboursNotified,
      sightingsReported,
      expiresAt,
    };

    // A previous snapshot for this tag may point at an older alert, and the
    // alert_id column is unique too, so clear both potential conflicts first.
    await this.prisma.reunionSnapshot.deleteMany({
      where: { OR: [{ tagId: pet.tagId }, { alertId }] },
    });

    const snapshot = await this.prisma.reunionSnapshot.create({
      data: { tagId: pet.tagId, ...data },
    });

    this.logger.log(
      `Reunion snapshot written for tag ${pet.tagId} (alert ${alertId}): ` +
        `${neighboursNotified} neighbours, ${sightingsReported} sightings, expires ${expiresAt.toISOString()}`,
    );

    return snapshot;
  }

  /**
   * Public read. Returns null when there is no snapshot or it has expired
   * (expired rows are deleted lazily here and daily by {@link purgeExpired}).
   */
  async findPublicByTagId(tagId: string): Promise<ReunionSnapshotDto | null> {
    const snapshot = await this.prisma.reunionSnapshot.findUnique({
      where: { tagId },
    });

    if (!snapshot) {
      return null;
    }

    if (snapshot.expiresAt.getTime() <= Date.now()) {
      await this.prisma.reunionSnapshot
        .delete({ where: { id: snapshot.id } })
        .catch(() => undefined);
      return null;
    }

    return ReunionSnapshotService.toDto(snapshot);
  }

  static toDto(snapshot: ReunionSnapshot): ReunionSnapshotDto {
    return {
      tagId: snapshot.tagId,
      alertId: snapshot.alertId,
      petName: snapshot.petName,
      petPhotoUrl: snapshot.petPhotoUrl ?? null,
      thankYouMessage: snapshot.thankYouMessage ?? null,
      resolvedAt: snapshot.resolvedAt.toISOString(),
      neighboursNotified: snapshot.neighboursNotified ?? null,
      sightingsReported: snapshot.sightingsReported,
      expiresAt: snapshot.expiresAt.toISOString(),
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.reunionSnapshot.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.log(`Purged ${count} expired reunion snapshot(s)`);
    }
    return count;
  }
}
