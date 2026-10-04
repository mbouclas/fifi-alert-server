import { Test } from '@nestjs/testing';
import { ReunionSnapshotService } from './reunion-snapshot.service';
import { PrismaService } from '../services/prisma.service';
import { NotificationStatus } from '../generated/prisma';

describe('ReunionSnapshotService', () => {
  let service: ReunionSnapshotService;
  const prisma = {
    notification: { findMany: jest.fn() },
    sighting: { count: jest.fn() },
    reunionSnapshot: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const resolvedAt = new Date('2026-10-04T18:00:00.000Z');
  const row = {
    id: 1,
    tagId: 'PET7K9X2A',
    alertId: 41,
    petName: 'Bella',
    petPhotoUrl: 'https://cdn/p.jpg',
    thankYouMessage: 'Thanks',
    resolvedAt,
    neighboursNotified: 2,
    sightingsReported: 3,
    expiresAt: new Date('2026-11-03T18:00:00.000Z'),
    created_at: resolvedAt,
    updated_at: resolvedAt,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.REUNION_TTL_DAYS;
    const module = await Test.createTestingModule({
      providers: [
        ReunionSnapshotService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReunionSnapshotService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('upsertForResolvedAlert', () => {
    it('counts distinct delivered users and all sightings, replaces by tag, uses primary photo', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { device: { user_id: 10 } },
        { device: { user_id: 10 } },
        { device: { user_id: 11 } },
      ]);
      prisma.sighting.count.mockResolvedValue(3);
      prisma.reunionSnapshot.deleteMany.mockResolvedValue({ count: 1 });
      prisma.reunionSnapshot.create.mockImplementation(async ({ data }) => ({
        id: 1,
        ...data,
      }));

      const snapshot = await service.upsertForResolvedAlert({
        alertId: 41,
        pet: {
          tagId: 'PET7K9X2A',
          name: 'Bella',
          primaryPhoto: 'https://cdn/primary.jpg',
          photos: ['https://cdn/first.jpg'],
        },
        thankYouMessage: 'Thanks',
        resolvedAt,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            alert_id: 41,
            excluded: false,
            status: {
              in: [
                NotificationStatus.SENT,
                NotificationStatus.DELIVERED,
                NotificationStatus.OPENED,
              ],
            },
          }),
        }),
      );
      expect(prisma.sighting.count).toHaveBeenCalledWith({
        where: { alert_id: 41 },
      });
      expect(prisma.reunionSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ tagId: 'PET7K9X2A' }, { alertId: 41 }] },
      });
      expect(snapshot.neighboursNotified).toBe(2);
      expect(snapshot.sightingsReported).toBe(3);
      expect(snapshot.petPhotoUrl).toBe('https://cdn/primary.jpg');
      expect(snapshot.thankYouMessage).toBe('Thanks');
      expect(snapshot.expiresAt).toEqual(new Date('2026-11-03T18:00:00.000Z'));
    });

    it('falls back to the first photo, null message, and honours REUNION_TTL_DAYS', async () => {
      process.env.REUNION_TTL_DAYS = '7';
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.sighting.count.mockResolvedValue(0);
      prisma.reunionSnapshot.deleteMany.mockResolvedValue({ count: 0 });
      prisma.reunionSnapshot.create.mockImplementation(async ({ data }) => ({
        id: 2,
        ...data,
      }));

      const snapshot = await service.upsertForResolvedAlert({
        alertId: 42,
        pet: {
          tagId: 'LUNA2M4PQ',
          name: 'Luna',
          primaryPhoto: null,
          photos: ['a.jpg'],
        },
        resolvedAt,
      });

      expect(snapshot.petPhotoUrl).toBe('a.jpg');
      expect(snapshot.thankYouMessage).toBeNull();
      expect(snapshot.neighboursNotified).toBe(0);
      expect(snapshot.expiresAt).toEqual(new Date('2026-10-11T18:00:00.000Z'));
    });
  });

  describe('findPublicByTagId', () => {
    it('returns null for unknown tag', async () => {
      prisma.reunionSnapshot.findUnique.mockResolvedValue(null);
      await expect(service.findPublicByTagId('NOPE')).resolves.toBeNull();
    });

    it('maps the row to the public DTO with ISO dates', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T00:00:00Z'));
      prisma.reunionSnapshot.findUnique.mockResolvedValue(row);
      await expect(service.findPublicByTagId('PET7K9X2A')).resolves.toEqual({
        tagId: 'PET7K9X2A',
        alertId: 41,
        petName: 'Bella',
        petPhotoUrl: 'https://cdn/p.jpg',
        thankYouMessage: 'Thanks',
        resolvedAt: '2026-10-04T18:00:00.000Z',
        neighboursNotified: 2,
        sightingsReported: 3,
        expiresAt: '2026-11-03T18:00:00.000Z',
      });
    });

    it('deletes and hides an expired snapshot', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-12-01T00:00:00Z'));
      prisma.reunionSnapshot.findUnique.mockResolvedValue(row);
      prisma.reunionSnapshot.delete.mockResolvedValue(row);
      await expect(service.findPublicByTagId('PET7K9X2A')).resolves.toBeNull();
      expect(prisma.reunionSnapshot.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  it('purgeExpired deletes rows past expiresAt', async () => {
    prisma.reunionSnapshot.deleteMany.mockResolvedValue({ count: 4 });
    await expect(service.purgeExpired()).resolves.toBe(4);
    expect(prisma.reunionSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
