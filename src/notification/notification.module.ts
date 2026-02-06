import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationService } from './notification.service';
import { NotificationQueueProcessor } from './notification-queue.processor';
import { FCMService } from './fcm.service';
import { APNsService } from './apns.service';
import { PrismaService } from '../services/prisma.service';
import { LocationModule } from '../location/location.module';
import { NOTIFICATION_QUEUE } from './notification.constants';

@Module({
    imports: [
        BullModule.registerQueue({
            name: NOTIFICATION_QUEUE,
            defaultJobOptions: {
                attempts: 3, // Max retries: 3
                backoff: {
                    type: 'exponential',
                    delay: 1000, // 1s, 5s, 30s exponential backoff
                },
                timeout: 30000, // 30 second timeout per job
                removeOnComplete: {
                    age: 3600, // Keep completed jobs for 1 hour
                    count: 100, // Keep last 100 completed
                },
                removeOnFail: {
                    age: 86400, // Keep failed jobs for 24 hours (debugging)
                    count: 500, // Keep last 500 failed (dead letter queue)
                },
            },
        }),
        LocationModule,
    ],
    providers: [
        NotificationService,
        NotificationQueueProcessor,
        FCMService,
        APNsService,
        PrismaService,
    ],
    exports: [NotificationService],
})
export class NotificationModule { }
