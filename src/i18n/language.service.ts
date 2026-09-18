import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Language } from '@prisma-lib/client';
import { PrismaService } from '../services/prisma.service';
import { CacheKeys, CacheTTL } from '../config/cache.config';

/**
 * Hard fallback used only when the `language` table is empty or unreachable.
 * Matches the default seeded by the migration.
 */
export const FALLBACK_LANGUAGE_CODE = 'el';

/**
 * Language Service
 *
 * Source of truth for the languages the API can serve and for resolving which
 * language a request should be answered in.
 *
 * Resolution order (see {@link LanguageService.resolve}):
 *   1. explicit `?lang=` query parameter
 *   2. `Accept-Language` header (q-value ordered)
 *   3. the default language (`language.is_default = true`)
 *
 * The active language list is cached (Redis) for {@link CacheTTL.LONG}.
 */
@Injectable()
export class LanguageService {
    private readonly logger = new Logger(LanguageService.name);

    constructor(
        @Inject(CACHE_MANAGER) private readonly cacheManager: any,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * All active languages ordered by sort_order (cached).
     */
    async getActive(): Promise<Language[]> {
        const cacheKey = CacheKeys.LANGUAGES_ACTIVE;

        try {
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                return cached as Language[];
            }
        } catch (error) {
            this.logger.warn(`Cache read failed for ${cacheKey}: ${error}`);
        }

        const languages = await this.prisma.language.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });

        try {
            await this.cacheManager.set(cacheKey, languages, CacheTTL.LONG * 1000);
        } catch (error) {
            this.logger.warn(`Cache write failed for ${cacheKey}: ${error}`);
        }

        return languages;
    }

    /**
     * The default language, or `null` if there are no active languages.
     */
    async getDefault(): Promise<Language | null> {
        const languages = await this.getActive();
        return languages.find((l) => l.isDefault) ?? languages[0] ?? null;
    }

    /**
     * Code of the default language, with a hard fallback.
     */
    async getDefaultCode(): Promise<string> {
        const def = await this.getDefault();
        return def?.code ?? FALLBACK_LANGUAGE_CODE;
    }

    /**
     * Whether `code` is an active language.
     */
    async isActiveCode(code: string): Promise<boolean> {
        const languages = await this.getActive();
        return languages.some((l) => l.code === code);
    }

    /**
     * Resolve the language a response should use.
     *
     * @param langParam      raw `?lang=` value (may be undefined / array / garbage)
     * @param acceptLanguage raw `Accept-Language` header value
     * @returns an active language code (falls back to the default)
     */
    async resolve(langParam?: unknown, acceptLanguage?: string): Promise<string> {
        const languages = await this.getActive();
        const active = new Set(languages.map((l) => l.code));
        const defaultCode =
            languages.find((l) => l.isDefault)?.code ??
            languages[0]?.code ??
            FALLBACK_LANGUAGE_CODE;

        // 1. explicit query param
        const fromParam = LanguageService.normalizeCode(
            Array.isArray(langParam) ? langParam[0] : langParam,
        );
        if (fromParam && active.has(fromParam)) {
            return fromParam;
        }

        // 2. Accept-Language header
        for (const candidate of LanguageService.parseAcceptLanguage(acceptLanguage)) {
            if (active.has(candidate)) {
                return candidate;
            }
        }

        // 3. default
        return defaultCode;
    }

    /**
     * Drop the cached language list (call after admin edits to `language`).
     */
    async invalidate(): Promise<void> {
        try {
            await this.cacheManager.del(CacheKeys.LANGUAGES_ACTIVE);
        } catch (error) {
            this.logger.warn(`Cache invalidation failed: ${error}`);
        }
    }

    /**
     * Normalise a language tag to a bare lowercase primary subtag:
     * `en-GB` -> `en`, `EL` -> `el`. Returns `null` for anything unusable.
     */
    static normalizeCode(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }
        const primary = value.trim().toLowerCase().split(/[-_]/)[0];
        return /^[a-z]{2,8}$/.test(primary) ? primary : null;
    }

    /**
     * Parse an `Accept-Language` header into normalised codes ordered by
     * descending quality. Wildcards and malformed entries are dropped.
     */
    static parseAcceptLanguage(header?: string): string[] {
        if (!header) {
            return [];
        }

        const entries = header
            .split(',')
            .map((part, index) => {
                const [tag, ...params] = part.trim().split(';');
                const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
                const q = qParam ? parseFloat(qParam.slice(2)) : 1;
                return {
                    code: tag === '*' ? null : LanguageService.normalizeCode(tag),
                    q: Number.isFinite(q) ? q : 0,
                    index,
                };
            })
            .filter((e): e is { code: string; q: number; index: number } => !!e.code && e.q > 0)
            .sort((a, b) => b.q - a.q || a.index - b.index);

        const seen = new Set<string>();
        const result: string[] = [];
        for (const e of entries) {
            if (!seen.has(e.code)) {
                seen.add(e.code);
                result.push(e.code);
            }
        }
        return result;
    }
}
