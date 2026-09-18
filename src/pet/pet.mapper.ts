import { Prisma } from '@prisma-lib/client';
import { petTypeInclude, toPetTypeResponse } from '../pet-types/pet-type.mapper';
import { PetResponseDto } from './dto/pet-response.dto';

/**
 * Prisma `include` used by every pet read so the pet type name can be localised.
 */
export const petWithTypeInclude = { petType: { include: petTypeInclude } } as const;

export type PetWithType = Prisma.PetGetPayload<{
    include: typeof petWithTypeInclude;
}>;

/**
 * Map a pet (with its pet type and translations) to the API response shape,
 * resolving the pet type name in `lang`.
 */
export function toPetResponse(
    pet: PetWithType,
    lang: string,
    defaultLang: string,
): PetResponseDto {
    const { petType, ...rest } = pet;
    return {
        ...rest,
        gender: rest.gender ?? undefined,
        size: rest.size ?? undefined,
        birthday: rest.birthday ?? undefined,
        petType: toPetTypeResponse(petType, lang, defaultLang),
    };
}
