export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum upload size in bytes (`MAX_FILE_SIZE`).
 *
 * Read directly from the environment so it can be passed to multer `limits`
 * inside decorators, which are evaluated before Nest DI exists. Multer rejects
 * oversize parts with 413 before the body is buffered; `UploadService` applies
 * the same limit again as a 400 for callers that bypass multer.
 */
export function getMaxFileSize(): number {
  const raw = process.env.MAX_FILE_SIZE;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_FILE_SIZE;
}
