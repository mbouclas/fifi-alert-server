import { registerAs } from '@nestjs/config';

export const DEFAULT_MAX_PET_PHOTOS = 5;

/**
 * Maximum number of photos a single pet may have.
 *
 * Reads `MAX_PET_PHOTOS` directly from the environment so it can be used in
 * decorator arguments (e.g. `FilesInterceptor`) that are evaluated at class
 * definition time, before Nest DI is available. Falls back to the default when
 * the value is missing or not a positive integer.
 */
export function getMaxPetPhotos(): number {
  const raw = process.env.MAX_PET_PHOTOS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_PET_PHOTOS;
}

/**
 * Pet configuration namespace.
 *
 * @example
 * constructor(
 *   @Inject(petConfig.KEY)
 *   private petConfig: ConfigType<typeof petConfig>,
 * ) {}
 */
export default registerAs('pet', () => ({
  /** Maximum photos per pet (upload count and stored `photos` length). */
  maxPhotos: getMaxPetPhotos(),
}));
