import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { UserModule } from '../user/user.module';
import { TokenService } from './services/token.service';
import { BearerTokenGuard } from './guards/bearer-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { MinUserLevelGuard } from './guards/min-user-level.guard';
import { PrismaService } from '../services/prisma.service';
import { TokenCleanupService } from './services/token-cleanup.service';
import { AuthEmailService } from './services/auth-email.service';
import { SharedModule } from '../shared/shared.module';

/**
 * AuthEndpointsModule
 *
 * Provides REST API endpoints for authentication operations.
 * Works alongside the @thallesp/nestjs-better-auth module.
 * Includes JWT bearer token authentication support.
 */
@Module({
  imports: [
    forwardRef(() => UserModule),
    SharedModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: {
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    TokenService,
    BearerTokenGuard,
    RolesGuard,
    MinUserLevelGuard,
    PrismaService,
    TokenCleanupService,
    AuthEmailService,
  ],
  exports: [TokenService, BearerTokenGuard, RolesGuard, MinUserLevelGuard, AuthEmailService],
})
export class AuthEndpointsModule { }
