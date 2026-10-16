import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { auth, getEmailVerificationCallbackURL } from '../../auth';
import { UserService } from '../../user/user.service';
import { AllowAnonymous } from '../decorators/allow-anonymous.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { ITokenUser } from '../services/token.service';
import { LoginIssuerService } from '../services/login-issuer.service';
import { AuthResponseDto } from '../dto';
import { PasskeyService } from './passkey.service';
import {
  PasskeyAuthenticationOptionsResponseDto,
  PasskeyDto,
  PasskeyLoginVerifyDto,
  PasskeyRegisterOptionsDto,
  PasskeyRegisterVerifyDto,
  PasskeyRegistrationOptionsResponseDto,
  RenamePasskeyDto,
} from './dto/passkey.dto';

const EMAIL_NOT_VERIFIED_MESSAGE =
  'Please verify your email address before logging in. We sent a new verification link to your email.';

/**
 * PasskeyController — WebAuthn passkeys: register, sign in, manage.
 *
 * Bearer routes rely on the global BearerTokenGuard. The two login routes are
 * public and sit behind the same per-visitor throttle as /auth/login
 * (UserThrottlerGuard buckets by X-Client-Key + first X-Forwarded-For hop).
 *
 * There is no global ValidationPipe in this app, so it is attached here.
 * `whitelist` strips unknown top-level keys; the nested WebAuthn `response`
 * is validated structurally by @simplewebauthn, not by class-validator.
 */
@ApiTags('Authentication')
@Controller('auth/passkeys')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PasskeyController {
  private readonly logger = new Logger(PasskeyController.name);

  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly userService: UserService,
    private readonly loginIssuer: LoginIssuerService,
  ) {}

  // ------------------------------------------------------------ registration

  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start passkey registration',
    description:
      'Returns PublicKeyCredentialCreationOptionsJSON for navigator.credentials.create() with residentKey "required" and the user\'s existing passkeys in excludeCredentials. The challenge is kept server-side for 5 minutes under `challengeId`.',
  })
  @ApiBody({ type: PasskeyRegisterOptionsDto, required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PasskeyRegistrationOptionsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Passkeys not configured (RP_ID / RP_ORIGINS missing)',
  })
  async registerOptions(
    @CurrentUser() user: ITokenUser,
  ): Promise<PasskeyRegistrationOptionsResponseDto> {
    // Body ({ name? }) is accepted for forward compatibility and ignored; the
    // label is sent again on verify.
    return this.passkeyService.startRegistration(user.id);
  }

  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Finish passkey registration',
    description:
      'Verifies the RegistrationResponseJSON against the stored challenge (single use) and stores the credential.',
  })
  @ApiBody({ type: PasskeyRegisterVerifyDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: PasskeyDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      '"unknown or expired challenge" (bad / reused / expired / wrong-user challengeId) or "verification failed" (signature, origin or RP ID mismatch)',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '"credential already registered"',
  })
  async registerVerify(
    @CurrentUser() user: ITokenUser,
    @Body() body: PasskeyRegisterVerifyDto,
  ): Promise<PasskeyDto> {
    return this.passkeyService.finishRegistration(user.id, body);
  }

  // ---------------------------------------------------------- authentication

  @Post('login/options')
  @AllowAnonymous()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // same as /auth/login
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start passkey sign-in (public)',
    description:
      'Returns PublicKeyCredentialRequestOptionsJSON with an always-empty allowCredentials: the browser offers its discoverable credentials for this RP. No user is identified at this stage. Throttled per visitor like /auth/login.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PasskeyAuthenticationOptionsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Visitor throttle',
  })
  async loginOptions(): Promise<PasskeyAuthenticationOptionsResponseDto> {
    return this.passkeyService.startLogin();
  }

  @Post('login/verify')
  @AllowAnonymous()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // same as /auth/login
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish passkey sign-in (public)',
    description:
      'Verifies the AuthenticationResponseJSON, updates the signature counter and issues the same JWT pair as POST /auth/login. 400 and 401 are deliberately indistinguishable to the user: the web app shows one neutral message.',
  })
  @ApiBody({ type: PasskeyLoginVerifyDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful (same body as /auth/login)',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'unknown / expired / reused challengeId',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description:
      '"unknown credential" (no passkey with that id) or "verification failed" (bad signature, origin / RP mismatch, counter regression)',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Email not verified (same rule as /auth/login)',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Visitor throttle',
  })
  async loginVerify(
    @Body() body: PasskeyLoginVerifyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const { userId, passkeyId } = await this.passkeyService.finishLogin(body);

    const userWithRelations = await this.userService.findOne({ id: userId }, [
      'roles',
      'gates',
    ]);
    if (!userWithRelations) {
      throw new UnauthorizedException('User not found');
    }

    // Same gate as /auth/login (not /auth/social).
    if (!userWithRelations.emailVerified) {
      await this.requestVerificationEmail(userWithRelations.email);
      throw new ForbiddenException(EMAIL_NOT_VERIFIED_MESSAGE);
    }

    return this.loginIssuer.issueTokens(userWithRelations as never, req, {
      method: 'passkey',
      extraMetadata: { passkeyId },
    });
  }

  // -------------------------------------------------------------- management

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my passkeys', description: 'Newest first.' })
  @ApiResponse({ status: HttpStatus.OK, type: [PasskeyDto] })
  async list(@CurrentUser() user: ITokenUser): Promise<PasskeyDto[]> {
    return this.passkeyService.list(user.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rename a passkey' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: RenamePasskeyDto })
  @ApiResponse({ status: HttpStatus.OK, type: PasskeyDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid name' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unknown id or belongs to another user (same status for both)',
  })
  async rename(
    @CurrentUser() user: ITokenUser,
    @Param('id') id: string,
    @Body() body: RenamePasskeyDto,
  ): Promise<PasskeyDto> {
    return this.passkeyService.rename(user.id, id, body.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a passkey',
    description:
      'No "last passkey" guard: password and social login remain available. Existing sessions stay valid.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unknown id or belongs to another user (same status for both)',
  })
  async remove(
    @CurrentUser() user: ITokenUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.passkeyService.remove(user.id, id);
  }

  // ----------------------------------------------------------------- helpers

  /** Mirrors AuthController.requestVerificationEmail (fire-and-log). */
  private async requestVerificationEmail(email: string): Promise<void> {
    try {
      await auth.api.sendVerificationEmail({
        body: { email, callbackURL: getEmailVerificationCallbackURL() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to request verification email for ${email}: ${String(error)}`,
      );
    }
  }
}
