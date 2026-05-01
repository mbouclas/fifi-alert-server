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
import { verifyPassword } from 'better-auth/crypto';
import type { Request } from 'express';
import { auth, getEmailVerificationCallbackURL } from '../../auth';
import { UserService } from '../../user/user.service';
import { TokenService } from '../services/token.service';
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
  ) {}

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
      const { headers, response: result } = await auth.api.signInEmail({
        body: {
          email: normalizedEmail,
          password: loginDto.password,
        },
        returnHeaders: true,
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

      // Extract session token from set-cookie header
      const setCookie = headers.get('set-cookie');
      let sessionToken: string | undefined;
      let expiresAt: string | undefined;

      if (setCookie) {
        // Parse session token from cookie
        const tokenMatch = setCookie.match(
          /better-auth\.session_token=([^;]+)/,
        );
        if (tokenMatch) {
          sessionToken = tokenMatch[1];
        }

        // Parse expiry from cookie (format: Expires=Fri, 05 Dec 2025 10:53:01 GMT)
        const expiresMatch = setCookie.match(/Expires=([^;,]+(?:,[^;]+)?)/i);
        if (expiresMatch) {
          const expDate = new Date(expiresMatch[1].trim());
          if (!isNaN(expDate.getTime())) {
            expiresAt = expDate.toISOString();
          }
        }
      }

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
            sessionToken: sessionToken ? '[REDACTED]' : undefined,
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
        session: sessionToken
          ? {
              token: sessionToken,
              expiresAt,
            }
          : undefined,
        accessToken: accessTokenData.token,
        refreshToken: refreshTokenData.token,
        expiresAt: accessTokenData.expiresAt.toISOString(),
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
      'Signs out the currently authenticated user and invalidates their session.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async logout(@Req() req: Request): Promise<{ message: string }> {
    try {
      // Forward the request to Better Auth's sign-out endpoint
      const headers = new Headers();

      // Copy relevant headers from the request
      if (req.headers.authorization) {
        headers.set('Authorization', req.headers.authorization);
      }
      if (req.headers.cookie) {
        headers.set('Cookie', req.headers.cookie);
      }

      await auth.api.signOut({
        headers,
      });

      this.logger.log('User logged out successfully');

      // Emit audit event for logout
      try {
        // Try to extract user info from bearer token if available
        let userId: number | undefined;
        if (req.headers.authorization) {
          try {
            const token = req.headers.authorization.replace('Bearer ', '');
            const decoded = await this.tokenService.validateAccessToken(token);
            userId = decoded.id; // Extract just the ID from the user object
          } catch (e) {
            // Token may be invalid, that's okay for logout
          }
        }

        const auditPayload: IAuditEventPayload = {
          eventType: 'LOGOUT',
          entityType: 'SESSION',
          userId,
          action: 'user_logout',
          description: 'User logged out',
          metadata: {
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.USER.LOGOUT, auditPayload);
      } catch (error) {
        this.logger.error('Failed to emit audit event for logout:', error);
      }

      return { message: 'Logout successful' };
    } catch (error) {
      this.logger.error(`Logout failed: ${error}`);
      return { message: 'Logout successful' };
    }
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
      await auth.api.resetPassword({
        body: {
          newPassword: resetDto.newPassword,
          token: resetDto.token,
        },
      });

      this.logger.log('Password reset successful');

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
  ): Promise<{ message: string }> {
    try {
      // Build headers from the request
      const headers = new Headers();

      if (req.headers.authorization) {
        headers.set('Authorization', req.headers.authorization);
      }
      if (req.headers.cookie) {
        headers.set('Cookie', req.headers.cookie);
      }

      await auth.api.changePassword({
        body: {
          currentPassword: updateDto.currentPassword,
          newPassword: updateDto.newPassword,
          revokeOtherSessions: updateDto.revokeOtherSessions ?? false,
        },
        headers,
      });

      this.logger.log('Password updated successfully');

      return { message: 'Password has been updated successfully' };
    } catch (error) {
      this.logger.error(`Password update failed: ${error}`);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('incorrect')
      ) {
        throw new UnauthorizedException('Current password is incorrect');
      }

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
    summary: 'Refresh access token',
    description: 'Generate a new access token using a valid refresh token.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          description: 'The refresh token',
        },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'New access token generated',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired refresh token',
  })
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ): Promise<{ accessToken: string; expiresAt: string }> {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      // Validate refresh token and get user ID
      const userId = await this.tokenService.validateRefreshToken(refreshToken);

      // Fetch user with roles and gates
      const user = await this.userService.findOne({ id: userId }, [
        'roles',
        'gates',
      ]);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new access token
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const accessTokenData = await this.tokenService.generateAccessToken(
        user as any,
        ipAddress,
        userAgent,
      );

      this.logger.log(`Access token refreshed for user: ${user.email}`);

      return {
        accessToken: accessTokenData.token,
        expiresAt: accessTokenData.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token refresh failed: ${error}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
