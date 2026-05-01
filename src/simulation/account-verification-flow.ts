import { ForbiddenException, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { auth } from '../auth.js';
import { AuthController } from '../auth/auth/auth.controller.js';
import { AuthEndpointsModule } from '../auth/auth.module.js';
import { authConfig } from '../config/index.js';
import { PrismaService } from '../services/prisma.service.js';
import { SharedModule } from '../shared/shared.module.js';
import { UserService } from '../user/user.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig],
      cache: true,
    }),
    AuthEndpointsModule,
  ],
})
class AccountVerificationSimulationModule {}

function makeRequest(): Request {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'user-agent': 'account-verification-simulation',
    },
  } as unknown as Request;
}

function waitForVerificationUrl(eventEmitter: EventEmitter2): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for verification email event'));
    }, 10_000);

    eventEmitter.once(
      'ACCOUNT_VERIFICATION_EMAIL_REQUESTED',
      (payload: { verificationUrl?: string }) => {
        clearTimeout(timeout);

        if (!payload.verificationUrl) {
          reject(new Error('Verification email event did not include a URL'));
          return;
        }

        resolve(payload.verificationUrl);
      },
    );
  });
}

async function seedUserRole(prisma: PrismaService): Promise<void> {
  await prisma.role.upsert({
    where: { slug: 'user' },
    update: {
      name: 'User',
      level: 1,
      description: 'Standard user role with basic permissions',
      active: true,
    },
    create: {
      name: 'User',
      slug: 'user',
      level: 1,
      description: 'Standard user role with basic permissions',
      active: true,
    },
  });
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    AccountVerificationSimulationModule,
    { logger: ['log', 'warn', 'error'] },
  );

  try {
    const prisma = app.get(PrismaService);
    const userService = app.get(UserService);
    const authController = app.get(AuthController);
    const eventEmitter = app.get(EventEmitter2);
    SharedModule.eventEmitter = eventEmitter;

    await seedUserRole(prisma);

    const timestamp = Date.now();
    const email = `verify_flow_${timestamp}@example.com`;
    const password = 'Test1234!';
    const verificationUrlPromise = waitForVerificationUrl(eventEmitter);

    console.log('1. Creating user via UserService.store...');
    const user = await userService.store({
      firstName: 'Verification',
      lastName: 'Flow',
      email,
      password,
      roles: ['user'],
    });

    if (!user) {
      throw new Error('UserService.store did not return a user');
    }

    console.log(
      `   Created user ${user.id} with emailVerified=${user.emailVerified}`,
    );

    const verificationUrl = await verificationUrlPromise;
    console.log('2. Captured Better Auth verification URL.');

    console.log('3. Confirming login is blocked before verification...');
    try {
      await authController.login({ email, password }, makeRequest());
      throw new Error('Login unexpectedly succeeded before email verification');
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }

      console.log(`   Login blocked as expected: ${error.message}`);
    }

    const token = new URL(verificationUrl).searchParams.get('token');
    if (!token) {
      throw new Error(
        `Verification URL did not contain a token: ${verificationUrl}`,
      );
    }

    console.log('4. Verifying email through Better Auth...');
    await auth.api.verifyEmail({
      query: { token },
    });

    const verifiedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    console.log(
      `   Database emailVerified=${verifiedUser.emailVerified} after verification`,
    );

    if (!verifiedUser.emailVerified) {
      throw new Error('Email verification did not update the database user');
    }

    console.log('5. Logging in after verification...');
    const loginResult = await authController.login(
      { email, password },
      makeRequest(),
    );

    if (!loginResult.accessToken || !loginResult.refreshToken) {
      throw new Error('Verified login did not return JWT tokens');
    }

    console.log('   Login succeeded and returned access/refresh tokens.');
    console.log('Account verification flow simulation completed successfully.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
