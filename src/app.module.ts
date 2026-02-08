import {
  Logger,
  MiddlewareConsumer,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { cacheConfig } from './config/cache.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared/shared.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';
import { UserModule } from './user/user.module';
import { AuthEndpointsModule } from './auth/auth.module';
import { authConfig } from './config';
import { BearerTokenGuard } from './auth/guards/bearer-token.guard';
import { GateModule } from './gate/gate.module';
import { AdminModule } from './admin/admin.module';
import { AlertModule } from './alert/alert.module';
import { SightingModule } from './sighting/sighting.module';
import { DeviceModule } from './device/device.module';
import { LocationModule } from './location/location.module';
import { NotificationModule } from './notification/notification.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { AuditModule } from './audit/audit.module';
import { PetModule } from './pet/pet.module';
import { AlertZoneCacheService } from './user/alert-zone-cache.service';
import { PetTypesModule } from './pet-types/pet-types.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig],
      cache: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: cacheConfig,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per ttl
      },
    ]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          attempts: 3, // Max retries: 3
          backoff: {
            type: 'exponential',
            delay: 1000, // Initial delay: 1s → 5s → 30s (exponential backoff)
          },
          timeout: 30000, // Job timeout: 30 seconds
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500, // Keep last 500 failed jobs (dead letter queue)
        },
      }),
    }),
    SharedModule,
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: false,
      disableGlobalAuthGuard: true,
    }),
    UserModule,
    AuthEndpointsModule,
    GateModule,
    AdminModule,
    AlertModule,
    SightingModule,
    DeviceModule,
    LocationModule,
    NotificationModule,
    UploadModule,
    HealthModule,
    AuditModule,
    PetModule,
    PetTypesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: BearerTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {
  private readonly logger = new Logger(AppModule.name);
  public static eventEmitter: EventEmitter2;

  constructor(
    private eventEmitter: EventEmitter2,
    private alertZoneCacheService: AlertZoneCacheService,
  ) {
    AppModule.eventEmitter = this.eventEmitter;
  }

  async onModuleInit() {
    this.logger.log('AppModule initialized');

    // Warm alert zones cache on startup
    await this.alertZoneCacheService.warmCache();
  }

  configure(consumer: MiddlewareConsumer) {
    // Apply request ID middleware to all routes
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
