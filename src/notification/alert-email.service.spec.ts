import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertEmailService } from './alert-email.service';
import { PrismaService } from '../services/prisma.service';
import { EmailService } from '@shared/email/email.service';

jest.mock('@shared/email/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendHtml: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

describe('AlertEmailService', () => {
  let service: AlertEmailService;
  let prisma: { user: { findUnique: jest.Mock } };
  const originalWebAppUrl = process.env.WEB_APP_URL;

  beforeEach(async () => {
    process.env.WEB_APP_URL = 'http://localhost:5173/';
    prisma = { user: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEmailService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: 'IEmailProvider', useValue: {} },
      ],
    }).compile();

    service = module.get(AlertEmailService);
  });

  afterEach(() => {
    process.env.WEB_APP_URL = originalWebAppUrl;
    jest.clearAllMocks();
  });

  describe('sendPetIsHomeEmail', () => {
    it('should render the petIsHome template linking to the public thank-you page', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2170,
        email: 'helper@example.com',
        emailVerified: true,
        firstName: 'Maria',
      });

      const sent = await service.sendPetIsHomeEmail(2170, {
        alertId: 41,
        tagId: 'PET7K9X2A',
        petName: 'Bella',
        petPhotoUrl: 'https://cdn/pets/5/primary.jpg',
        thankYouMessage: 'Thanks everyone!',
      });

      expect(sent).toBe(true);
      const emailInstance = (EmailService as unknown as jest.Mock).mock
        .results[0].value;
      expect(emailInstance.sendHtml).toHaveBeenCalledWith(
        'petIsHome',
        expect.objectContaining({
          to: 'helper@example.com',
          templateData: expect.objectContaining({
            user: { firstName: 'Maria' },
            reunion: {
              petName: 'Bella',
              photoUrl: 'https://cdn/pets/5/primary.jpg',
              thankYouMessage: 'Thanks everyone!',
              viewUrl: 'http://localhost:5173/thank-you/PET7K9X2A',
            },
          }),
        }),
      );
    });

    it('should not email unverified addresses', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'x@example.com',
        emailVerified: false,
        firstName: '',
      });
      await expect(
        service.sendPetIsHomeEmail(1, {
          alertId: 1,
          tagId: 'PET7K9X2A',
          petName: 'Bella',
        }),
      ).resolves.toBe(false);
      expect(EmailService).not.toHaveBeenCalled();
    });
  });

  describe('sendAlertEmail', () => {
    it('should link to the web app alert page and its sighting form', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2170,
        email: 'someone@example.com',
        emailVerified: true,
      });

      const sent = await service.sendAlertEmail(2170, {
        alertId: 16,
        petName: 'Fifi',
        petSpecies: 'DOG',
        petDescription: 'Brown terrier',
        distanceKm: 2.67,
      });

      expect(sent).toBe(true);

      const emailInstance = (EmailService as unknown as jest.Mock).mock
        .results[0].value;
      expect(emailInstance.sendHtml).toHaveBeenCalledWith(
        'newAlert',
        expect.objectContaining({
          to: 'someone@example.com',
          templateData: expect.objectContaining({
            appUrl: 'http://localhost:5173',
            alert: expect.objectContaining({
              viewUrl: 'http://localhost:5173/alerts/16',
              reportSightingUrl: 'http://localhost:5173/alerts/16/sighting',
            }),
          }),
        }),
      );
    });

    it('should not email unverified addresses', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'x@example.com',
        emailVerified: false,
      });

      const sent = await service.sendAlertEmail(1, {
        alertId: 16,
        petName: 'Fifi',
        petSpecies: 'DOG',
        petDescription: '',
        distanceKm: 1,
      });

      expect(sent).toBe(false);
      expect(EmailService).not.toHaveBeenCalled();
    });
  });
});
