/**
 * Environment Variable Loader
 *
 * This file MUST be imported first before any other imports
 * to ensure environment variables are loaded before Prisma Client initialization
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file with override option to work with Bun's auto-loading
// Bun automatically loads .env, but we need to ensure variables are available
// for Prisma initialization
config({
  path: resolve(process.cwd(), '.env'),
  override: true,
  debug: process.env.DEBUG_DOTENV === 'true',
});

// Validate critical environment variables
const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
const missing = requiredVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missing.join(', ')}`,
  );
  console.error('   Please check your .env file');
  process.exit(1);
}

// Export a dummy value to make this a module
export const envLoaded = true;
