import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma.service';

describe('Languages (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        prisma = moduleFixture.get<PrismaService>(PrismaService);

        // Ensure the seeded languages exist (migration seeds them; be defensive).
        for (const lang of [
            { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', isDefault: true, sortOrder: 10 },
            { code: 'en', name: 'English', nativeName: 'English', isDefault: false, sortOrder: 20 },
        ]) {
            await prisma.language.upsert({
                where: { code: lang.code },
                update: { isActive: true },
                create: lang,
            });
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await app.close();
    });

    describe('GET /languages', () => {
        it('should be public and return the active languages with the default', async () => {
            const response = await request(app.getHttpServer())
                .get('/languages')
                .expect(200);

            expect(response.body.default).toBe('el');
            expect(Array.isArray(response.body.languages)).toBe(true);

            const codes = response.body.languages.map((l: any) => l.code);
            expect(codes).toEqual(expect.arrayContaining(['el', 'en']));

            const el = response.body.languages.find((l: any) => l.code === 'el');
            expect(el).toMatchObject({
                code: 'el',
                name: 'Greek',
                nativeName: 'Ελληνικά',
                isDefault: true,
            });

            const defaults = response.body.languages.filter((l: any) => l.isDefault);
            expect(defaults).toHaveLength(1);
        });

        it('should return languages sorted by sortOrder', async () => {
            const response = await request(app.getHttpServer())
                .get('/languages')
                .expect(200);

            const orders = response.body.languages.map((l: any) => l.sortOrder);
            expect(orders).toEqual([...orders].sort((a, b) => a - b));
        });
    });
});
