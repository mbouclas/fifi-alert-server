import { Logger, Module } from '@nestjs/common';
import { PrismaService } from '@services/prisma.service';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { EmailService } from './email/email.service';
import { MailgunService } from './mailgun/mailgun.service';
import { SmtpService } from './smtp/smtp.service';
import { IEmailProvider } from './email/interfaces/email-provider.interface';
import { createEmailProvider } from './email/factories/email-provider.factory';

@Module({
  providers: [
    PrismaService,
    RequestIdMiddleware,
    LoggingInterceptor,
    // Dynamic email provider selection based on MAIL_SYSTEM env var
    // Note: MailgunService and SmtpService are NOT listed here to avoid
    // instantiating both. The factory creates only the needed provider.
    {
      provide: 'IEmailProvider',
      useFactory: (eventEmitter: EventEmitter2): IEmailProvider => {
        const mailSystem = process.env.MAIL_SYSTEM || 'smtp';
        return createEmailProvider(mailSystem, eventEmitter);
      },
      inject: [EventEmitter2],
    },
    // EmailService using the dynamic provider
    {
      provide: EmailService,
      useFactory: (
        emailProvider: IEmailProvider,
        eventEmitter: EventEmitter2,
      ): EmailService => {
        return new EmailService(emailProvider, eventEmitter);
      },
      inject: ['IEmailProvider', EventEmitter2],
    },
  ],
  exports: [
    PrismaService,
    RequestIdMiddleware,
    LoggingInterceptor,
    EmailService,
    'IEmailProvider', // Export email provider for direct injection in services
  ],
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    CacheModule.register({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB),
      },
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: true,
      maxListeners: 50,
    }),
  ],
})
export class SharedModule {
  public static eventEmitter: EventEmitter2;
  static moduleRef: ModuleRef;
  private readonly logger = new Logger(SharedModule.name);
  constructor(
    private eventEmitter: EventEmitter2,
    private m: ModuleRef,
  ) {
    SharedModule.eventEmitter = this.eventEmitter;
    SharedModule.moduleRef = this.m;
  }

  onModuleInit() {
    this.logger.log('SharedModule initialized');
  }

  static getService(service: any) {
    return SharedModule.moduleRef.get(service);
  }
}
