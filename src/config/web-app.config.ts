/**
 * Web app URL configuration.
 *
 * Every link that ends up inside an outgoing email must point at the web
 * frontend, never at this API server. `WEB_APP_URL` is the single source for
 * that origin (dev: http://localhost:5173). `APP_URL` is kept as a deprecated
 * alias for older deployments.
 */

const DEFAULT_WEB_APP_URL = 'https://fifi-alert.com';

let warnedMissingWebAppUrl = false;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Public base URL of the web app, without a trailing slash.
 */
export function getWebAppUrl(): string {
  const configured = process.env.WEB_APP_URL || process.env.APP_URL;

  if (configured && configured.trim()) {
    return stripTrailingSlash(configured.trim());
  }

  if (!warnedMissingWebAppUrl) {
    warnedMissingWebAppUrl = true;
    console.warn(
      `WEB_APP_URL is not set; email links will use ${DEFAULT_WEB_APP_URL}`,
    );
  }

  return DEFAULT_WEB_APP_URL;
}

/**
 * Build an absolute web-app URL from a path and optional query params.
 * Query values are URL-encoded.
 */
export function buildWebAppUrl(
  path: string,
  query?: Record<string, string | undefined | null>,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${getWebAppUrl()}${normalizedPath}`;

  if (!query) {
    return url;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, value);
    }
  }

  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/** Test helper: reset the one-time missing-config warning. */
export function resetWebAppUrlWarning(): void {
  warnedMissingWebAppUrl = false;
}
