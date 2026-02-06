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
  NotFoundException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { auth } from '../../auth';
import { UserService } from '../../user/user.service';
import { TokenService } from '../services/token.service';
import { AllowAnonymous } from '../decorators/allow-anonymous.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { BearerTokenGuard } from '../guards/bearer-token.guard';
import type { ITokenUser } from '../services/token.service';
import {
  LoginDto,
  SignupDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  UpdatePasswordDto,
  AuthResponseDto,
  MeResponseDto,
} from '../dto';

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
  ) { }

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
    try {
      const { headers, response: result } = await auth.api.signInEmail({
        body: {
          email: loginDto.email.toLowerCase(),
          password: loginDto.password,
        },
        returnHeaders: true,
      });

      if (!result?.user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Fetch user with roles and gates for JWT generation
      const userWithRelations = await this.userService.findOne(
        { id: Number(result.user.id) },
        ['roles', 'gates'],
      );

      if (!userWithRelations) {
        throw new UnauthorizedException('User not found');
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
        const tokenMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
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
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Login failed: ${error}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Get current authenticated user details
   */
  @Get('me')
  @AllowAnonymous()
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Returns the authenticated user\'s details with all relationships including roles and gates.',
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

    const user = await this.userService.findOne(
      { id: userId },
      ['roles', 'gates'],
    );

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
    description: 'Signs out the currently authenticated user and invalidates their session.',
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
        headers.set('Authorization', req.headers.authorization as string);
      }
      if (req.headers.cookie) {
        headers.set('Cookie', req.headers.cookie as string);
      }

      await auth.api.signOut({
        headers,
      });

      this.logger.log('User logged out successfully');

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

      const { headers, response: result } = await auth.api.signUpEmail({
        body: {
          email: signupDto.email.toLowerCase(),
          password: signupDto.password,
          name: fullName,
          image: signupDto.image,
        },
        returnHeaders: true,
      });

      if (!result?.user) {
        throw new BadRequestException('Failed to create user');
      }

      // Fetch user with roles and gates for JWT generation
      const userWithRelations = await this.userService.findOne(
        { id: Number(result.user.id) },
        ['roles', 'gates'],
      );

      if (!userWithRelations) {
        throw new BadRequestException('User creation failed');
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
        const tokenMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
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


      this.logger.log(`New user signed up: ${result.user.email}`);

      return {
        message: 'Signup successful',
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
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Signup failed: ${error}`);

      // Check if the error indicates user already exists
      const errorMessage = error instanceof Error ? error.message : String(error);
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
    description: 'Initiates the password reset process by sending a reset link to the user\'s email.',
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
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    } catch (error) {
      this.logger.error(`Password reset request failed: ${error}`);
      // Still return success to prevent email enumeration
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
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
    description: 'Resets the user\'s password using a valid token received via email.',
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
        headers.set('Authorization', req.headers.authorization as string);
      }
      if (req.headers.cookie) {
        headers.set('Cookie', req.headers.cookie as string);
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

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('incorrect')) {
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
      const user = await this.userService.findOne(
        { id: userId },
        ['roles', 'gates'],
      );

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
