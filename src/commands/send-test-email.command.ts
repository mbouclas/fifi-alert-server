import { Command, CommandRunner } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@shared/email/email.service';

/**
 * Send Test Email Command
 *
 * This command sends a test email to verify the email system is working properly.
 * It uses the 'welcome' template as a generic test.
 *
 * Usage:
 *   bun run cli send-test-email test@test.com
 */
@Command({
  name: 'send-test-email',
  description: 'Send a test email to verify email system configuration',
  arguments: '<email>',
})
@Injectable()
export class SendTestEmailCommand extends CommandRunner {
  private readonly logger = new Logger(SendTestEmailCommand.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async run(inputs: string[], options?: Record<string, any>): Promise<void> {
    const recipientEmail = inputs[0];

    if (!recipientEmail) {
      this.logger.error('❌ Email address is required');
      console.log('Usage: bun run cli send-test-email <email>');
      throw new Error('Email address is required');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      this.logger.error(`❌ Invalid email address: ${recipientEmail}`);
      throw new Error(`Invalid email address: ${recipientEmail}`);
    }

    this.logger.log(`📧 Sending test email to: ${recipientEmail}`);

    try {
      // Get email configuration
      const fromName = this.configService.get<string>(
        'EMAIL_FROM_NAME',
        'FiFi Alert',
      );
      const fromEmail = this.configService.get<string>(
        'EMAIL_FROM_EMAIL',
        'noreply@fifi-alert.com',
      );

      // Send test email using the 'welcome' template
      const result = await this.emailService.sendHtml('welcome', {
        to: recipientEmail,
        from: `${fromName} <${fromEmail}>`,
        templateData: {
          userName: 'Test User',
          appName: 'FiFi Alert',
          loginUrl: 'https://fifi-alert.com/login',
        },
      });

      this.logger.log('✅ Test email sent successfully!');
      console.log('\n📬 Email Details:');
      console.log(`   To: ${recipientEmail}`);
      console.log(`   From: ${fromName} <${fromEmail}>`);
      console.log(`   Template: welcome`);
      console.log(`   Message ID: ${result.id}`);
      console.log(`   Status: ${result.status}`);
    } catch (error) {
      this.logger.error('❌ Failed to send test email', error.message);
      console.log('\n❌ Error Details:');
      console.log(`   ${error.message}`);
      throw error;
    }
  }
}
