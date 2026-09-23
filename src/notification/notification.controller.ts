import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import {
  NotificationRelevanceDto,
  VapidPublicKeyResponseDto,
} from './dto';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { Session } from '../decorators/session.decorator';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'Get the VAPID public key for web push subscription',
    description:
      'Public by design - the VAPID public key is not a secret and the browser needs it before the user is prompted for notification permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'VAPID public key',
    type: VapidPublicKeyResponseDto,
  })
  getVapidPublicKey(): VapidPublicKeyResponseDto {
    return {
      publicKey: this.configService.get<string>('VAPID_PUBLIC_KEY') ?? '',
    };
  }

  @Post(':id/relevance')
  @UseGuards(BearerTokenGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Report whether a delivered notification was actually relevant',
    description:
      'Called by the client when a notification is opened, after re-reading exact position. Also marks the notification as OPENED.',
  })
  @ApiParam({ name: 'id', description: 'Notification ID', type: Number })
  @ApiResponse({ status: 204, description: 'Relevance recorded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async reportRelevance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotificationRelevanceDto,
    @Session() session: any,
  ): Promise<void> {
    await this.notificationService.recordRelevance(id, session.userId, dto);
  }
}
