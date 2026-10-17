import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InvitationService } from './invitation.service';
import {
  CreateInvitationDto,
  InvitationDto,
  InvitationPreviewDto,
  InvitationStatsDto,
  INVITATIONS_DEFAULT_LIMIT,
  ListInvitationsQueryDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { ClientKeyGuard } from '../auth/guards/client-key.guard';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { RequireClientKey } from '../auth/decorators/require-client-key.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ITokenUser } from '../auth/services/token.service';

const NOT_CONFIGURED = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  description: 'Invitations not configured (INVITE_BASE_URL unset)',
};

/**
 * "Invite a friend by email" (BACKEND_WORK_ORDER_INVITATIONS.md).
 *
 * Everything needs a bearer token except `GET /invitations/accept/:token`,
 * which the web BFF calls anonymously with `X-Client-Key`.
 */
@ApiTags('invitations')
@Controller('invitations')
@UseGuards(BearerTokenGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
@ApiResponse(NOT_CONFIGURED)
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create and send an invitation',
    description:
      'Stores the invitation, mints a single-use token, replaces `{inviteLink}` in the body with the accept URL and emails the recipient (queued after the row is committed). ' +
      'Rules: recipient must not be the caller; `409 already_registered` when the address already has an account; `409 invite_pending` when the caller already has an open invite to it; ' +
      '`429` after INVITE_DAILY_LIMIT sends + resends in a rolling 24 h.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Invitation stored and queued for sending',
    type: InvitationDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Validation failed; `message` lists every failing rule (e.g. `body must contain exactly one {inviteLink}`, plain-text violations, own address)',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Body carries `code`: `already_registered` (recipient has an account) or `invite_pending` (open invite from you to this address)',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Daily invitation limit reached (or global cap)',
  })
  async create(
    @CurrentUser() user: ITokenUser,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    return this.invitations.create(user, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List the caller's invitations",
    description: `Newest first, only rows the caller sent. Pending rows past their expiry are flipped to \`expired\` first. \`limit\` max 100, default ${INVITATIONS_DEFAULT_LIMIT}.`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "The caller's invitations",
    type: InvitationDto,
    isArray: true,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async list(
    @CurrentUser() user: ITokenUser,
    @Query() query: ListInvitationsQueryDto,
  ): Promise<InvitationDto[]> {
    return this.invitations.list(
      user.id,
      query.limit ?? INVITATIONS_DEFAULT_LIMIT,
      query.offset ?? 0,
    );
  }

  /** Declared before `:id` routes so the literal segment wins. */
  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's invitation counts",
    description: 'Cheap aggregate of the list: total sent, accepted, pending.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationStatsDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async stats(@CurrentUser() user: ITokenUser): Promise<InvitationStatsDto> {
    return this.invitations.stats(user.id);
  }

  @Get('accept/:token')
  @AllowAnonymous()
  @RequireClientKey()
  @UseGuards(ClientKeyGuard)
  @ApiSecurity('client-key')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiParam({
    name: 'token',
    description: 'Raw token from the `/accept-invite?token=` link',
  })
  @ApiOperation({
    summary: 'Validate an invite link (anonymous, read-only)',
    description:
      'Called by the web BFF with `X-Client-Key` (and `X-Forwarded-For` for per-visitor throttling, 20/min). ' +
      'Returns the prefill data for a pending, unexpired invitation. Does not mark anything accepted. ' +
      'Unknown, expired, revoked and accepted tokens all answer 404 without saying which.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationPreviewDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid X-Client-Key',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invitation not found or no longer valid',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded (20/min per visitor)',
  })
  async preview(@Param('token') token: string): Promise<InvitationPreviewDto> {
    return this.invitations.preview(token);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Invitation id', example: '1042' })
  @ApiOperation({
    summary: 'Withdraw a pending invitation',
    description:
      "Owner only (other senders' rows answer 404). Sets status `revoked`; the token stops validating immediately.",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Withdrawn' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Not found (or not yours)',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Only pending invitations can be withdrawn',
  })
  async revoke(
    @CurrentUser() user: ITokenUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.invitations.revoke(user.id, id);
  }

  @Post(':id/resend')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Invitation id', example: '1042' })
  @ApiOperation({
    summary: 'Send an invitation again',
    description:
      'Owner only. Allowed for `pending` and `expired` rows. Mints a NEW token (the old link stops working), re-renders the stored subject/body, ' +
      'sets status `pending`, `sentAt` now and a fresh `expiresAt`. Enforces INVITE_RESEND_COOLDOWN_MINUTES since the last send and counts toward the daily limit.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Not found (or not yours)',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      '`code: invite_pending`: a newer pending invitation to the same address exists',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Accepted or revoked invitations cannot be resent',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Resend cooldown or daily limit',
  })
  async resend(
    @CurrentUser() user: ITokenUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InvitationDto> {
    return this.invitations.resend(user.id, id);
  }
}
