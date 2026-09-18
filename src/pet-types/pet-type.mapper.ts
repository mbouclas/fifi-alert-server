import { Prisma } from '@prisma-lib/client';
import { PetTypeResponseDto } from './dto/pet-type-response.dto';

/**
 * Prisma `include` that pulls every translation of a pet type.
 * Use this everywhere a pet type is read so the mapper can resolve the name.
 */
export const petTypeInclude = { translations: true } as const;

export type PetTypeWithTranslations = Prisma.PetTypeGetPayload<{
    include: typeof petTypeInclude;
}>;

/**
 * Pick the translation for `lang`, falling back to `defaultLang`, then to any.
 */
export function pickTranslation(
    pt: PetTypeWithTranslations,
    lang: string,
    defaultLang: string,
): { name: string; lang: string } {
    const t =
        pt.translations.find((x) => x.langCode === lang) ??
        pt.translations.find((x) => x.langCode === defaultLang) ??
        pt.translations[0];

    return t ? { name: t.name, lang: t.langCode } : { name: pt.slug, lang };
}

/**
 * Map a pet type (with translations) to its API response shape.
 *
 * @param includeAll when true, also attach the full `translations` map (admin views)
 */
export function toPetTypeResponse(
    pt: PetTypeWithTranslations,
    lang: string,
    defaultLang: string,
    includeAll = false,
): PetTypeResponseDto {
    const { name, lang: usedLang } = pickTranslation(pt, lang, defaultLang);

    const dto: PetTypeResponseDto = {
        id: pt.id,
        slug: pt.slug,
        order: pt.order,
        name,
        lang: usedLang,
        created_at: pt.created_at,
        updated_at: pt.updated_at,
    };

    if (includeAll) {
        dto.translations = Object.fromEntries(
            pt.translations.map((t) => [t.langCode, t.name]),
        );
    }

    return dto;
}
