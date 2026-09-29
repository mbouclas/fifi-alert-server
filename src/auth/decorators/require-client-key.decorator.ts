import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the client key requirement decorator
 */
export const REQUIRE_CLIENT_KEY_KEY = 'requireClientKey';

/**
 * Decorator to mark routes that client apps may call WITHOUT a logged-in user,
 * but only when they present a valid static app key in the `X-Client-Key`
 * header (validated by ClientKeyGuard against `CLIENT_API_KEYS`).
 *
 * Combine with `@AllowAnonymous()` so the global BearerTokenGuard does not
 * demand a user token, and with `@UseGuards(ClientKeyGuard)`.
 *
 * @example
 * ```typescript
 * @Get()
 * @AllowAnonymous()
 * @RequireClientKey()
 * @UseGuards(ClientKeyGuard)
 * async findAll() {}
 * ```
 */
export const RequireClientKey = () => SetMetadata(REQUIRE_CLIENT_KEY_KEY, true);
