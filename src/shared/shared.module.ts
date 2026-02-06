import { Logger, Module } from '@nestjs/common';
import { PrismaService } from '@services/prisma.service';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

@Module({
  providers: [PrismaService, RequestIdMiddleware, LoggingInterceptor],
  exports: [PrismaService, RequestIdMiddleware, LoggingInterceptor],
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
