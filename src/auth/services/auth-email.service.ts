import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { EmailService, IEmailTemplate } from '@shared/email/email.service';
import type { IEmailProvider } from '@shared/email/interfaces/email-provider.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Email template registry for auth-related emails
 */
const authServiceEmailTemplates: Record<string, IEmailTemplate> = {
    emailVerification: {
        subject: 'Verify Your Email Address',
        file: 'notifications/email/auth/emailVerification.njk',
    },
    accountActivation: {
        subject: 'Activate Your Account',
        file: 'notifications/email/auth/accountActivation.njk',
    },
    loginNotification: {
        subject: 'New Login to Your Account',
        file: 'notifications/email/auth/loginNotification.njk',
    },
    passwordChanged: {
        subject: 'Your Password Has Been Changed',
        file: 'notifications/email/auth/passwordChanged.njk',
    },
};

/**
 * AuthEmailService
 * 
 * Handles sending authentication-related emails such as:
 * - Email verification
 * - Account activation
 * - Login notifications (security alerts)
 * - Password change confirmations
 */
@Injectable()
export class AuthEmailService {
    private readonly logger = new Logger(AuthEmailService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
        @Inject('IEmailProvider') private readonly emailProvider: IEmailProvider,
    ) { }

    /**
     * Send email verification email to user
     * @param userId - User ID to send verification email to
     * @param verificationToken - Token for email verification link
     * @returns Result object with success status and message
     * @throws Error if user not found or email send fails
     */
    async sendEmailVerificationEmail(
        userId: number,
        verificationToken: string,
    ): Promise<{ success: boolean; message: string }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('USER_NOT_FOUND');
        }

        const emailService = new EmailService(
            this.emailProvider,
            this.eventEmitter,
            authServiceEmailTemplates,
        );

        const verificationUrl = `${process.env.APP_URL}/auth/verify-email?token=${verificationToken}`;

        try {
            await emailService.sendHtml('emailVerification', {
                from: String(process.env.MAIL_NOTIFICATIONS_FROM),
                to: user.email,
                templateData: {
                    user: { ...user, password: undefined },
                    verificationUrl,
                    expirationHours: 24,
                    appUrl: process.env.APP_URL,
                },
            });

            this.logger.log(`Email verification email sent to user ${userId}`);

            return {
                success: true,
                message: `Verification email sent to ${user.email}`,
            };
        } catch (error) {
            this.logger.error(`Failed to send email verification email for user ${userId}:`, error);
            throw new Error('FAILED_TO_SEND_EMAIL_VERIFICATION_EMAIL');
        }
    }

    /**
     * Send account activation email to user
     * @param userId - User ID to send activation email to
     * @param activationToken - Token for account activation link
     * @returns Result object with success status and message
     * @throws Error if user not found or email send fails
     */
    async sendAccountActivationEmail(
        userId: number,
        activationToken: string,
    ): Promise<{ success: boolean; message: string }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('USER_NOT_FOUND');
        }

        const emailService = new EmailService(
            this.emailProvider,
            this.eventEmitter,
            authServiceEmailTemplates,
        );

        const activationUrl = `${process.env.APP_URL}/auth/activate?token=${activationToken}`;

        try {
            await emailService.sendHtml('accountActivation', {
                from: String(process.env.MAIL_NOTIFICATIONS_FROM),
                to: user.email,
                templateData: {
                    user: { ...user, password: undefined },
                    activationUrl,
                    expirationHours: 48,
                    appUrl: process.env.APP_URL,
                },
            });

            this.logger.log(`Account activation email sent to user ${userId}`);

            return {
                success: true,
                message: `Activation email sent to ${user.email}`,
            };
        } catch (error) {
            this.logger.error(`Failed to send account activation email for user ${userId}:`, error);
            throw new Error('FAILED_TO_SEND_ACCOUNT_ACTIVATION_EMAIL');
        }
    }

    /**
     * Send login notification email (security alert)
     * @param userId - User ID to send notification to
     * @param loginDetails - Details about the login (device, location, IP, etc.)
     * @returns Result object with success status and message
     * @throws Error if user not found or email send fails
     */
    async sendLoginNotificationEmail(
        userId: number,
        loginDetails: {
            ipAddress?: string;
            userAgent?: string;
            location?: string;
            timestamp: Date;
        },
    ): Promise<{ success: boolean; message: string }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('USER_NOT_FOUND');
        }

        const emailService = new EmailService(
            this.emailProvider,
            this.eventEmitter,
            authServiceEmailTemplates,
        );

        try {
            await emailService.sendHtml('loginNotification', {
                from: String(process.env.MAIL_NOTIFICATIONS_FROM),
                to: user.email,
                templateData: {
                    user: { ...user, password: undefined },
                    loginDetails: {
                        ...loginDetails,
                        timestampFormatted: new Date(loginDetails.timestamp).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            second: 'numeric',
                            hour12: true,
                        }),
                    },
                    appUrl: process.env.APP_URL,
                },
            });

            this.logger.log(`Login notification email sent to user ${userId}`);

            return {
                success: true,
                message: `Login notification sent to ${user.email}`,
            };
        } catch (error) {
            this.logger.error(`Failed to send login notification email for user ${userId}:`, error);
            throw new Error('FAILED_TO_SEND_LOGIN_NOTIFICATION_EMAIL');
        }
    }

    /**
     * Send password changed confirmation email
     * @param userId - User ID to send confirmation to
     * @returns Result object with success status and message
     * @throws Error if user not found or email send fails
     */
    async sendPasswordChangedEmail(
        userId: number,
    ): Promise<{ success: boolean; message: string }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('USER_NOT_FOUND');
        }

        const emailService = new EmailService(
            this.emailProvider,
            this.eventEmitter,
            authServiceEmailTemplates,
        );

        try {
            const timestamp = new Date();
            await emailService.sendHtml('passwordChanged', {
                from: String(process.env.MAIL_NOTIFICATIONS_FROM),
                to: user.email,
                templateData: {
                    user: { ...user, password: undefined },
                    timestamp,
                    timestampFormatted: timestamp.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                        second: 'numeric',
                        hour12: true,
                    }),
                    appUrl: process.env.APP_URL,
                },
            });

            this.logger.log(`Password changed email sent to user ${userId}`);

            return {
                success: true,
                message: `Password change confirmation sent to ${user.email}`,
            };
        } catch (error) {
            this.logger.error(`Failed to send password changed email for user ${userId}:`, error);
            throw new Error('FAILED_TO_SEND_PASSWORD_CHANGED_EMAIL');
        }
    }
}
