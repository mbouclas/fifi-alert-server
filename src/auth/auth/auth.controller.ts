import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { verifyPassword, hashPassword } from 'better-auth/crypto';
import type { Request } from 'express';
import { auth, getEmailVerificationCallbackURL } from '../../auth';
import { UserService } from '../../user/user.service';
import {
  TokenService,
  RefreshTokenReuseError,
} from '../services/token.service';
import { PrismaService } from '../../services/prisma.service';
import { AllowAnonymous } from '../decorators/allow-anonymous.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { BearerTokenGuard } from '../guards/bearer-token.guard';
import type { ITokenUser } from '../services/token.service';
import { SanitizeUserInterceptor } from '../../shared/interceptors/sanitize-user.interceptor';
import {
  LoginDto,
  SignupDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  UpdatePasswordDto,
  AuthResponseDto,
  MeResponseDto,
  RefreshTokenDto,
  RefreshResponseDto,
  LogoutDto,
  LogoutAllResponseDto,
} from '../dto';
import { AUDIT_EVENT_NAMES } from '../../audit/audit-event-names';
import { IAuditEventPayload } from '../../audit/interfaces/audit-event-payload.interface';

/**
 * Auth Controller
 *
 * Handles authentication operations including login, logout, signup,
 * password reset, and password update.
 * All routes are prefixed with /auth.
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Extract the raw bearer token from the Authorization header, if any.
   */
  private bearerFromRequest(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }

  /**
   * User login with email and password
   */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates a user with email and password credentials.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = loginDto.email.toLowerCase();
    let failureStage = 'better-auth-sign-in';

    try {
      failureStage = 'pre-email-verification-check';
      const existingUser = await this.userService.findOne(
        { email: normalizedEmail },
        ['accounts'],
      );
      const credentialAccount = ((existingUser as any)?.accounts ?? []).find(
        (account: { providerId?: string }) =>
          account.providerId === 'credential',
      ) as { password?: string | null } | undefined;

      if (
        existingUser &&
        !existingUser.emailVerified &&
        credentialAccount?.password &&
        (await verifyPassword({
          hash: credentialAccount.password,
          password: loginDto.password,
        }))
      ) {
        failureStage = 'email-verification-required';
        await this.requestVerificationEmail(normalizedEmail);
        throw new ForbiddenException(
          'Please verify your email address before logging in. We sent a new verification link to your email.',
        );
      }

      failureStage = 'better-auth-sign-in';
      const result = await auth.api.signInEmail({
        body: {
          email: normalizedEmail,
          password: loginDto.password,
        },
      });

      if (!result?.user) {
        failureStage = 'better-auth-empty-result';
        throw new UnauthorizedException('Invalid credentials');
      }

      // Fetch user with roles and gates for JWT generation
      failureStage = 'local-user-relations-lookup';
      const userWithRelations = await this.userService.findOne(
        { id: Number(result.user.id) },
        ['roles', 'gates'],
      );

      if (!userWithRelations) {
        throw new UnauthorizedException('User not found');
      }

      if (!userWithRelations.emailVerified) {
        failureStage = 'email-verification-required';
        await this.requestVerificationEmail(normalizedEmail);
        throw new ForbiddenException(
          'Please verify your email address before logging in. We sent a new verification link to your email.',
        );
      }

      // Generate JWT tokens
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const accessTokenData = await this.tokenService.generateAccessToken(
        userWithRelations as any,
        ipAddress,
        userAgent,
      );
      const refreshTokenData = await this.tokenService.generateRefreshToken(
        userWithRelations as any,
        ipAddress,
        userAgent,
      );

      // NOTE: the better-auth session cookie token is deliberately NOT
      // returned to clients anymore. Bearer clients only need the JWT pair.
      this.logger.log(`User logged in: ${result.user.email}`);

      // Emit audit event for successful login
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'LOGIN',
          entityType: 'SESSION',
          userId: Number(result.user.id),
          action: 'user_login',
          description: `User logged in: ${result.user.email}`,
          metadata: {
            email: result.user.email,
            ipAddress,
            userAgent,
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGIN, auditPayload);
      } catch (error) {
        this.logger.error('Failed to emit audit event for login:', error);
      }

      return {
        message: 'Login successful',
        user: {
          id: String(result.user.id),
          email: result.user.email,
          name: result.user.name,
        },
        accessToken: accessTokenData.token,
        refreshToken: refreshTokenData.token,
        expiresAt: accessTokenData.expiresAt.toISOString(),
        refreshExpiresAt: refreshTokenData.expiresAt.toISOString(),
      };
    } catch (error) {
      await this.logFailedLoginAttempt(
        loginDto.email,
        normalizedEmail,
        failureStage,
        error,
      );

      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        // Emit audit event for failed login
        try {
          const isForbidden = error instanceof ForbiddenException;
          const auditPayload: IAuditEventPayload = {
            eventType: 'FAILURE',
            entityType: 'SESSION',
            action: isForbidden
              ? 'user_login_email_not_verified'
              : 'user_login_failed',
            description: isForbidden
              ? `Login blocked until email verification: ${loginDto.email}`
              : `Failed login attempt for email: ${loginDto.email}`,
            errorMessage: error.message,
            metadata: {
              email: loginDto.email,
              ipAddress: req.ip || req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
            },
            success: false,
          };
          this.eventEmitter.emit(
            AUDIT_EVENT_NAMES.USER.LOGIN_FAILED,
            auditPayload,
          );
        } catch (auditError) {
          this.logger.error(
            'Failed to emit audit event for login failure:',
            auditError,
          );
        }
        throw error;
      }
      this.logger.error(`Login failed: ${error}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async requestVerificationEmail(
    email: string,
    callbackURL?: string,
  ): Promise<void> {
    try {
      await auth.api.sendVerificationEmail({
        body: {
          email,
          callbackURL: callbackURL || getEmailVerificationCallbackURL(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to request verification email for ${email}: ${error}`,
      );
    }
  }

  private async logFailedLoginAttempt(
    submittedEmail: string,
    normalizedEmail: string,
    stage: string,
    error: unknown,
  ): Promise<void> {
    try {
      const user = await this.userService.findOne({ email: normalizedEmail }, [
        'accounts',
      ]);
      const accounts = ((user as any)?.accounts ?? []) as Array<{
        id: number;
        accountId: string;
        providerId: string;
        password?: string | null;
      }>;
      const credentialAccount = accounts.find(
        (account) => account.providerId === 'credential',
      );
      const errorDetails =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : { message: String(error) };

      this.logger.warn(
        `Failed login diagnostic: ${JSON.stringify({
          stage,
          submittedEmail,
          normalizedEmail,
          emailWasNormalized: submittedEmail !== normalizedEmail,
          userFound: Boolean(user),
          userId: user?.id,
          userEmail: user?.email,
          emailVerified: user?.emailVerified,
          banned: user?.banned,
          accountCount: accounts.length,
          accountProviderIds: accounts.map((account) => account.providerId),
          credentialAccountFound: Boolean(credentialAccount),
          credentialAccountId: credentialAccount?.id,
          credentialAccountAccountId: credentialAccount?.accountId,
          credentialAccountMatchesEmail:
            credentialAccount?.accountId === normalizedEmail,
          credentialAccountHasPassword: Boolean(credentialAccount?.password),
          error: errorDetails,
        })}`,
      );
    } catch (diagnosticError) {
      this.logger.error(
        'Failed to collect login failure diagnostics:',
        diagnosticError,
      );
    }
  }

  /**
   * Get current authenticated user details
   */
  @Get('me')
  @AllowAnonymous()
  @UseGuards(BearerTokenGuard)
  @UseInterceptors(SanitizeUserInterceptor)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description:
      "Returns the authenticated user's details with all relationships including roles and gates.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User details retrieved successfully',
    type: MeResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async me(
    @Session() session: UserSession,
    @CurrentUser() tokenUser?: ITokenUser,
  ): Promise<MeResponseDto> {
    // Support both bearer token and session cookie authentication
    let userId: number | undefined;

    if (tokenUser) {
      // Bearer token authentication
      userId = tokenUser.id;
    } else if (session?.user?.id) {
      // Session cookie authentication
      userId = Number(session.user.id);
    }

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.userService.findOne({ id: userId }, [
      'roles',
      'gates',
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user as any as MeResponseDto;
  }

  /**
   * User logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'User logout',
    description:
      'Revokes the bearer access token from the Authorization header and, if provided in the body, the refresh token. Also signs out any better-auth cookie session. Always returns 200.',
  })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logout successful',
  })
  async logout(
    @Req() req: Request,
    @Body() body?: LogoutDto,
  ): Promise<{ message: string }> {
    let userId: number | undefined;
    const accessToken = this.bearerFromRequest(req);

    // Identify the user BEFORE revoking (validation fails afterwards).
    if (accessToken) {
      try {
        const decoded =
          await this.tokenService.validateAccessToken(accessToken);
        userId = decoded.id;
      } catch {
        // Token may already be invalid; that's fine for logout.
      }
    }

    // Revoke the JWT pair. Each call is best-effort.
    if (accessToken) {
      try {
        await this.tokenService.revokeToken(accessToken);
      } catch (error) {
        this.logger.warn(`Failed to revoke access token on logout: ${error}`);
      }
    }
    if (body?.refreshToken) {
      try {
        await this.tokenService.revokeToken(body.refreshToken);
      } catch (error) {
        this.logger.warn(`Failed to revoke refresh token on logout: ${error}`);
      }
    }

    // Also sign out any better-auth cookie session.
    try {
      const headers = new Headers();
      if (req.headers.authorization) {
        headers.set('Authorization', req.headers.authorization);
      }
      if (req.headers.cookie) {
        headers.set('Cookie', req.headers.cookie);
      }
      await auth.api.signOut({ headers });
    } catch (error) {
      this.logger.debug(`better-auth signOut on logout: ${error}`);
    }

    this.logger.log(
      `User logged out${userId ? `: ${userId}` : ''} (access=${!!accessToken}, refresh=${!!body?.refreshToken})`,
    );

    // Emit audit event for logout
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'LOGOUT',
        entityType: 'SESSION',
        userId,
        action: 'user_logout',
        description: 'User logged out',
        metadata: {
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          revokedAccessToken: !!accessToken,
          revokedRefreshToken: !!body?.refreshToken,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGOUT, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for logout:', error);
    }

    return { message: 'Logout successful' };
  }

  /**
   * Logout from all devices: revoke every access/refresh token of the user
   */
  // No @AllowAnonymous here: BearerTokenGuard must reject a missing/invalid
  // token with 401 rather than letting the handler run without a user.
  @Post('logout-all')
  @UseGuards(BearerTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout from all devices',
    description:
      'Revokes every access and refresh token belonging to the authenticated user, including the one used for this request.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All sessions revoked',
    type: LogoutAllResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async logoutAll(
    @CurrentUser() user: ITokenUser,
    @Req() req: Request,
  ): Promise<LogoutAllResponseDto> {
    const revokedCount = await this.tokenService.revokeAllUserTokens(user.id);

    this.logger.log(
      `User ${user.id} logged out from all devices (${revokedCount} tokens revoked)`,
    );

    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'LOGOUT',
        entityType: 'SESSION',
        userId: user.id,
        action: 'user_logout_all',
        description: 'User logged out from all devices',
        metadata: {
          scope: 'all',
          revokedCount,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGOUT, auditPayload);
    } catch (error) {
      this.logger.error('Failed to emit audit event for logout-all:', error);
    }

    return { message: 'All sessions revoked', revokedCount };
  }

  /**
   * User signup
   */
  @Post('signup')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 signups per hour
  @AllowAnonymous()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'User signup',
    description: 'Registers a new user with email and password credentials.',
  })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Signup successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or user already exists',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with this email already exists',
  })
  async signup(
    @Body() signupDto: SignupDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    try {
      const fullName = `${signupDto.firstName} ${signupDto.lastName}`.trim();

      const result = await auth.api.signUpEmail({
        body: {
          email: signupDto.email.toLowerCase(),
          password: signupDto.password,
          name: fullName,
          image: signupDto.image,
          callbackURL: signupDto.callbackURL,
        },
      });

      if (!result?.user) {
        throw new BadRequestException('Failed to create user');
      }

      await this.userService.update(
        { id: Number(result.user.id) },
        {
          firstName: signupDto.firstName,
          lastName: signupDto.lastName,
          meta: { firstTime: true },
        },
      );

      await this.requestVerificationEmail(
        signupDto.email.toLowerCase(),
        signupDto.callbackURL,
      );

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      this.logger.log(`New user signed up: ${result.user.email}`);

      // Emit audit event for signup pending email verification
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'CREATE',
          entityType: 'USER',
          userId: Number(result.user.id),
          action: 'user_signup_verification_required',
          description: `New user signed up pending email verification: ${result.user.email}`,
          metadata: {
            email: result.user.email,
            ipAddress,
            userAgent,
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
      } catch (error) {
        this.logger.error('Failed to emit audit event for signup:', error);
      }

      return {
        message:
          'Signup successful. Please verify your email address before logging in.',
        user: {
          id: String(result.user.id),
          email: result.user.email,
          name: result.user.name,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Signup failed: ${error}`);

      // Check if the error indicates user already exists
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes('exist') ||
        errorMessage.toLowerCase().includes('duplicate')
      ) {
        throw new BadRequestException('User with this email already exists');
      }

      throw new BadRequestException('Failed to create user');
    }
  }

  /**
   * Request password reset
   */
  @Post('request-password-reset')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      "Initiates the password reset process by sending a reset link to the user's email.",
  })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset email sent (if user exists)',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async requestPasswordReset(
    @Body() requestDto: RequestPasswordResetDto,
  ): Promise<{ message: string }> {
    try {
      await auth.api.requestPasswordReset({
        body: {
          email: requestDto.email.toLowerCase(),
          redirectTo: requestDto.redirectTo,
        },
      });

      this.logger.log(`Password reset requested for: ${requestDto.email}`);

      // Always return success to prevent email enumeration
      return {
        message:
          'If an account exists with this email, a password reset link has been sent.',
      };
    } catch (error) {
      this.logger.error(`Password reset request failed: ${error}`);
      // Still return success to prevent email enumeration
      return {
        message:
          'If an account exists with this email, a password reset link has been sent.',
      };
    }
  }

  /**
   * Reset password with token
   */
  @Post('reset-password')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description:
      "Resets the user's password using a valid token received via email.",
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset successful',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired token',
  })
  async resetPassword(
    @Body() resetDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    try {
      // Resolve the owner BEFORE better-auth consumes (deletes) the token.
      // better-auth stores reset tokens as verification rows keyed
      // `reset-password:<token>` whose value is the user id.
      let userId: number | undefined;
      try {
        const verification = await this.prisma.verification.findFirst({
          where: { identifier: `reset-password:${resetDto.token}` },
          select: { value: true },
        });
        const parsed = Number(verification?.value);
        if (Number.isInteger(parsed) && parsed > 0) userId = parsed;
      } catch (lookupError) {
        this.logger.warn(
          `Could not resolve user for reset token: ${lookupError}`,
        );
      }

      await auth.api.resetPassword({
        body: {
          newPassword: resetDto.newPassword,
          token: resetDto.token,
        },
      });

      // A password reset implies the old credential may be compromised:
      // sign the user out everywhere.
      if (userId !== undefined) {
        const revoked = await this.tokenService.revokeAllUserTokens(userId);
        this.logger.log(
          `Password reset successful for user ${userId}; revoked ${revoked} tokens`,
        );
      } else {
        this.logger.warn(
          'Password reset successful but user id unresolved; existing tokens NOT revoked',
        );
      }

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      this.logger.error(`Password reset failed: ${error}`);
      throw new BadRequestException('Invalid or expired reset token');
    }
  }

  /**
   * Update password (authenticated user)
   */
  @Post('update-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update password',
    description: 'Updates the password for the currently authenticated user.',
  })
  @ApiBody({ type: UpdatePasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated or invalid current password',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async updatePassword(
    @Body() updateDto: UpdatePasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string; revokedSessions: number }> {
    try {
      // Identify the caller. Bearer token first — better-auth has no bearer
      // plugin configured, so it only understands its own session COOKIE and
      // cannot authenticate a JWT client on its own.
      const currentAccessToken = this.bearerFromRequest(req);
      let userId: number | undefined;

      if (currentAccessToken) {
        try {
          const decoded =
            await this.tokenService.validateAccessToken(currentAccessToken);
          userId = decoded.id;
        } catch {
          throw new UnauthorizedException('Invalid or expired access token');
        }
      } else if (req.headers.cookie) {
        // Cookie client: resolve the user through better-auth's session.
        const headers = new Headers();
        headers.set('Cookie', req.headers.cookie);
        const session = await auth.api.getSession({ headers });
        if (session?.user?.id) {
          userId = Number(session.user.id);
        }
      }

      if (userId === undefined) {
        throw new UnauthorizedException('Not authenticated');
      }

      // Verify the current password and write the new one directly against
      // the credential account. This mirrors the verification done in login()
      // and works for bearer and cookie clients alike.
      const credentialAccount = await this.prisma.account.findFirst({
        where: { userId, providerId: 'credential' },
        select: { id: true, password: true },
      });

      if (!credentialAccount?.password) {
        throw new BadRequestException(
          'This account does not use password authentication',
        );
      }

      const currentPasswordValid = await verifyPassword({
        hash: credentialAccount.password,
        password: updateDto.currentPassword,
      });

      if (!currentPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      const newHash = await hashPassword(updateDto.newPassword);
      await this.prisma.account.update({
        where: { id: credentialAccount.id },
        data: { password: newHash },
      });

      // Always revoke other JWT sessions on password change; keep the
      // current device signed in.
      const revokedSessions = await this.tokenService.revokeAllUserTokens(
        userId,
        currentAccessToken,
      );

      this.logger.log(
        `Password updated successfully${userId ? ` for user ${userId}` : ''}; revoked ${revokedSessions} other tokens`,
      );

      return {
        message: 'Password has been updated successfully',
        revokedSessions,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`Password update failed: ${error}`);
      throw new BadRequestException('Failed to update password');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  @Post('refresh-token')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes per minute
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh tokens (rotating)',
    description:
      'Exchanges a valid refresh token for a NEW access token AND a NEW refresh token. The presented refresh token is revoked immediately. Presenting an already-rotated refresh token again returns 401; if that happens outside the grace window, every session of the user is revoked.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'New token pair generated',
    type: RefreshResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid, expired, or already-used refresh token',
  })
  async refreshToken(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<RefreshResponseDto> {
    if (!body?.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
      const rotated = await this.tokenService.rotateRefreshToken(
        body.refreshToken,
        ipAddress,
        userAgent,
      );

      this.logger.log(`Tokens refreshed for user: ${rotated.userId}`);

      return {
        accessToken: rotated.accessToken,
        expiresAt: rotated.accessExpiresAt.toISOString(),
        refreshToken: rotated.refreshToken,
        refreshExpiresAt: rotated.refreshExpiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        try {
          const auditPayload: IAuditEventPayload = {
            eventType: 'FAILURE',
            entityType: 'SESSION',
            userId: error.userId,
            action: 'refresh_token_reuse_detected',
            description:
              'Rotated refresh token was presented again; all user sessions revoked',
            errorMessage: error.message,
            metadata: { ipAddress, userAgent },
            success: false,
          };
          this.eventEmitter.emit(
            AUDIT_EVENT_NAMES.USER.LOGIN_FAILED,
            auditPayload,
          );
        } catch (auditError) {
          this.logger.error(
            'Failed to emit audit event for refresh token reuse:',
            auditError,
          );
        }
        throw error;
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token refresh failed: ${error}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
