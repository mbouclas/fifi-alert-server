import { registerAs } from '@nestjs/config';

/**
 * Auth configuration namespace.
 *
 * Centralizes all authentication-related configuration values
 * to avoid hardcoding and ensure consistency across the application.
 *
 * @example
 * // Inject in a service
 * constructor(
 *   @Inject(authConfig.KEY)
 *   private authConfig: ConfigType<typeof authConfig>,
 * ) {}
 *
 * // Access values
 * const minLength = this.authConfig.password.minLength;
 */
export default registerAs('auth', () => ({
  password: {
    /** Minimum password length requirement */
    minLength: parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH ?? '4', 10),
    /** Maximum password length requirement */
    maxLength: parseInt(process.env.AUTH_PASSWORD_MAX_LENGTH ?? '128', 10),
  },
}));
