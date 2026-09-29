import { registerAs } from '@nestjs/config';

export const DEFAULT_MAX_SIGHTING_PHOTOS = 3;
export const DEFAULT_SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS = 24;

/**
 * Maximum number of photos a single sighting may have.
 *
 * Reads `MAX_SIGHTING_PHOTOS` directly from the environment so it can be used
 * in decorator arguments (e.g. `FilesInterceptor`) that are evaluated at class
 * definition time, before Nest DI is available. Falls back to the default when
 * the value is missing or not a positive integer.
 *
 * The web client mirrors this value in its own `MAX_SIGHTING_PHOTOS` env; the
 * server is the source of truth.
 */
export function getMaxSightingPhotos(): number {
  const raw = process.env.MAX_SIGHTING_PHOTOS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_SIGHTING_PHOTOS;
}

/**
 * How long after a sighting is created its reporter may still attach photos.
 * Reads `SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS`; falls back to 24 hours.
 */
export function getSightingPhotoUploadWindowHours(): number {
  const raw = process.env.SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS;
  const parsed = raw !== undefined ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS;
}

export default registerAs('sighting', () => ({
  /** Maximum photos per sighting (upload count and stored `photos` length). */
  maxPhotos: getMaxSightingPhotos(),
  /** Hours after `created_at` during which the reporter may upload photos. */
  photoUploadWindowHours: getSightingPhotoUploadWindowHours(),
}));
