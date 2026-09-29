import { Prisma } from '@prisma-lib/client';
import { petWithTypeInclude, toPetResponse } from '../pet/pet.mapper';
import { AdoptionListingResponseDto } from './dto/adoption-listing-response.dto';

/**
 * Prisma `include` used by every adoption listing read: the pet (with its
 * localisable type) and a minimal owner projection.
 */
export const adoptionListingInclude = {
  pet: { include: petWithTypeInclude },
  user: { select: { id: true, name: true } },
} as const;

export type AdoptionListingWithRelations = Prisma.AdoptionListingGetPayload<{
  include: typeof adoptionListingInclude;
}>;

/**
 * Map a listing (with pet + owner) to the API response shape.
 */
export function toAdoptionListingResponse(
  listing: AdoptionListingWithRelations,
  lang: string,
  defaultLang: string,
  distanceKm?: number,
): AdoptionListingResponseDto {
  const { pet, user, ...rest } = listing;
  return {
    id: rest.id,
    petId: rest.petId,
    status: rest.status,
    lat: rest.lat,
    lon: rest.lon,
    locationAddress: rest.locationAddress ?? undefined,
    description: rest.description ?? undefined,
    adoptedAt: rest.adoptedAt ?? undefined,
    distanceKm,
    pet: toPetResponse(pet, lang, defaultLang),
    owner: { id: user.id, name: user.name ?? undefined },
    created_at: rest.created_at,
    updated_at: rest.updated_at,
  };
}
