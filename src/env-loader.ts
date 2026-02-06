/**
 * Environment Variable Loader
 * 
 * This file MUST be imported first before any other imports
 * to ensure environment variables are loaded before Prisma Client initialization
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file
config({ path: resolve(process.cwd(), '.env') });

// Export a dummy value to make this a module
export const envLoaded = true;
