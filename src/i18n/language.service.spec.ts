import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../services/prisma.service';
import { FALLBACK_LANGUAGE_CODE, LanguageService } from './language.service';
import { CacheKeys } from '../config/cache.config';

describe('LanguageService', () => {
    let service: LanguageService;

    const languages = [
        { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', isDefault: true, isActive: true, sortOrder: 10 },
        { code: 'en', name: 'English', nativeName: 'English', isDefault: false, isActive: true, sortOrder: 20 },
    ];

    const mockPrisma = {
        language: { findMany: jest.fn() },
    };

    const mockCache = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LanguageService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: CACHE_MANAGER, useValue: mockCache },
            ],
        }).compile();

        service = module.get(LanguageService);
        jest.clearAllMocks();
        mockCache.get.mockResolvedValue(undefined);
        mockCache.set.mockResolvedValue(undefined);
        mockPrisma.language.findMany.mockResolvedValue(languages);
    });

    describe('getActive', () => {
        it('should read from the database and populate the cache on a miss', async () => {
            const result = await service.getActive();

            expect(result).toEqual(languages);
            expect(mockPrisma.language.findMany).toHaveBeenCalledWith({
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
            });
            expect(mockCache.set).toHaveBeenCalledWith(
                CacheKeys.LANGUAGES_ACTIVE,
                languages,
                expect.any(Number),
            );
        });

        it('should serve from the cache on a hit', async () => {
            mockCache.get.mockResolvedValue(languages);

            await service.getActive();

            expect(mockPrisma.language.findMany).not.toHaveBeenCalled();
        });

        it('should survive cache failures', async () => {
            mockCache.get.mockRejectedValue(new Error('redis down'));
            mockCache.set.mockRejectedValue(new Error('redis down'));

            await expect(service.getActive()).resolves.toEqual(languages);
        });
    });

    describe('getDefaultCode', () => {
        it('should return the default language code', async () => {
            await expect(service.getDefaultCode()).resolves.toBe('el');
        });

        it('should fall back to the first active language when none is flagged default', async () => {
            mockPrisma.language.findMany.mockResolvedValue([
                { ...languages[1], isDefault: false },
            ]);
            await expect(service.getDefaultCode()).resolves.toBe('en');
        });

        it('should use the hard fallback when the table is empty', async () => {
            mockPrisma.language.findMany.mockResolvedValue([]);
            await expect(service.getDefaultCode()).resolves.toBe(FALLBACK_LANGUAGE_CODE);
        });
    });

    describe('resolve', () => {
        it('should prefer the query parameter', async () => {
            await expect(service.resolve('en', 'el')).resolves.toBe('en');
        });

        it('should normalise region and case in the query parameter', async () => {
            await expect(service.resolve('EN-gb')).resolves.toBe('en');
        });

        it('should ignore unknown query parameters and use Accept-Language', async () => {
            await expect(service.resolve('xx', 'en-GB,en;q=0.9,el;q=0.8')).resolves.toBe('en');
        });

        it('should honour q-values in Accept-Language', async () => {
            await expect(service.resolve(undefined, 'fr;q=1,el;q=0.5,en;q=0.9')).resolves.toBe('en');
        });

        it('should skip wildcards and unknown languages in Accept-Language', async () => {
            await expect(service.resolve(undefined, '*, fr, de')).resolves.toBe('el');
        });

        it('should fall back to the default when nothing matches', async () => {
            await expect(service.resolve()).resolves.toBe('el');
        });

        it('should tolerate array query values', async () => {
            await expect(service.resolve(['en', 'el'])).resolves.toBe('en');
        });
    });

    describe('parseAcceptLanguage', () => {
        it('should order by quality and de-duplicate', () => {
            expect(
                LanguageService.parseAcceptLanguage('el;q=0.5, en-US, en;q=0.8, *;q=0.1'),
            ).toEqual(['en', 'el']);
        });

        it('should return an empty list for missing headers', () => {
            expect(LanguageService.parseAcceptLanguage(undefined)).toEqual([]);
        });
    });

    describe('invalidate', () => {
        it('should delete the cache key', async () => {
            await service.invalidate();
            expect(mockCache.del).toHaveBeenCalledWith(CacheKeys.LANGUAGES_ACTIVE);
        });
    });
});
