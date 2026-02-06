import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaSingleton } from "@services/prisma-singleton.service";

const prisma = PrismaSingleton.getInstance();

// Auth configuration constants - read from env with defaults
const AUTH_PASSWORD_MIN_LENGTH = parseInt(String(process.env.AUTH_PASSWORD_MIN_LENGTH), 10) || 4;

export const auth = betterAuth({
  basePath: "/api/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  experimental: { joins: true },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
  },
  advanced: {
    database: {
      // Use "serial" for autoincrement integer IDs - Better Auth will convert between string and numeric types
      generateId: "serial",
    },
  },
  user: {
    // Map firstName and lastName as additional fields
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        defaultValue: "",
        fieldName: "firstName",
      },
      lastName: {
        type: "string",
        required: false,
        defaultValue: "",
        fieldName: "lastName",
      },
    },
  },
  trustedOrigins: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(",")
    : ["*"],
  hooks: {}, // Minimum required to use hooks
});