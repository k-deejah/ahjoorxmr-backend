import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendMail(options: SendEmailOptions): Promise<void> {
    try {
      const { to, subject, template, context, html, text } = options;

      this.logger.log(
        `Sending email to ${JSON.stringify(to)} with subject: ${subject}`,
      );

      await this.mailerService.sendMail({
        to,
        subject,
        template: template ? `en/${template}` : undefined,
        context,
        html,
        text,
      });

      this.logger.log(`Email sent successfully to ${JSON.stringify(to)}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const activationLink = `${this.configService.get('APP_URL')}/auth/verify-email?token=placeholder`;

    await this.sendMail({
      to: email,
      subject: 'Welcome to Ahjoorxmr!',
      template: 'welcome',
      context: {
        userName: username,
        email,
        activationLink,
      },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    username: string,
    resetToken: string,
  ): Promise<void> {
    const resetLink = `${this.configService.get('APP_URL')}/auth/reset-password?token=${resetToken}`;
    const expiryTime = '1 hour';

    await this.sendMail({
      to: email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      context: {
        userName: username,
        resetLink,
        expiryTime,
      },
    });
  }

  async sendEmailVerification(
    email: string,
    username: string,
    verificationToken: string,
  ): Promise<void> {
    const verificationLink = `${this.configService.get('APP_URL')}/auth/verify-email?token=${verificationToken}`;

    await this.sendMail({
      to: email,
      subject: 'Verify Your Email Address',
      template: 'welcome',
      context: {
        userName: username,
        email,
        activationLink: verificationLink,
      },
    });
  }

  async sendGroupInvitationEmail(
    email: string,
    username: string,
    groupName: string,
    inviterName: string,
    invitationToken: string,
  ): Promise<void> {
    const acceptLink = `${this.configService.get('APP_URL')}/groups/accept-invitation?token=${invitationToken}`;

    await this.sendMail({
      to: email,
      subject: `You've been invited to join ${groupName}`,
      template: 'group-invitation',
      context: {
        userName: username,
        groupName,
        inviterName,
        acceptLink,
      },
    });
  }

  async sendNotificationEmail(
    email: string,
    username: string,
    notificationTitle: string,
    notificationBody: string,
    actionLink?: string,
  ): Promise<void> {
    await this.sendMail({
      to: email,
      subject: notificationTitle,
      template: 'notification',
      context: {
        userName: username,
        notificationTitle,
        notificationBody,
        actionLink: actionLink || '#',
      },
    });
  }
}
