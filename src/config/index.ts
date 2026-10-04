/**
 * Configuration module exports
 *
 * This file re-exports all configuration namespaces for easy importing.
 */
export { default as authConfig } from './auth.config';
export { default as emailConfig } from './email.config';
export type { EmailConfig, EmailProvider } from './email.config';
export {
  getWebAppUrl,
  buildWebAppUrl,
  resetWebAppUrlWarning,
} from './web-app.config';
export { default as petConfig } from './pet.config';
export { getMaxPetPhotos, DEFAULT_MAX_PET_PHOTOS } from './pet.config';
export { default as sightingConfig } from './sighting.config';
export {
  getMaxSightingPhotos,
  getSightingPhotoUploadWindowHours,
  DEFAULT_MAX_SIGHTING_PHOTOS,
  DEFAULT_SIGHTING_PHOTO_UPLOAD_WINDOW_HOURS,
} from './sighting.config';
export { getMaxFileSize, DEFAULT_MAX_FILE_SIZE } from './upload.config';
export { default as reunionConfig } from './reunion.config';
export { getReunionTtlDays, DEFAULT_REUNION_TTL_DAYS } from './reunion.config';
