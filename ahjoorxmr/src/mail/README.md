# Email Notification Service

A comprehensive email notification system for user communications with template support, queue-based async sending, and retry mechanisms.

## Features

- ✅ Email service using Nodemailer via @nestjs-modules/mailer
- ✅ Handlebars template engine for email templates
- ✅ Queue system for async email sending (BullMQ/Redis)
- ✅ Email verification workflow
- ✅ Password reset emails
- ✅ Retry mechanism for failed emails (3 attempts with exponential backoff)
- ✅ Dead-letter queue for permanently failed emails
- ✅ Multi-language template support (English, Spanish, French)

## Configuration

Add the following environment variables to your `.env` file:

```env
# Mail Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your_email@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_FROM="Ahjoorxmr <noreply@ahjoorxmr.com>"

# Application URL (for email links)
APP_URL=http://localhost:3000
```

### Gmail Configuration

If using Gmail, you need to:

1. Enable 2-factor authentication on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password as `MAIL_PASSWORD`

### Other SMTP Providers

- **SendGrid**: `MAIL_HOST=smtp.sendgrid.net`, `MAIL_PORT=587`
- **Mailgun**: `MAIL_HOST=smtp.mailgun.org`, `MAIL_PORT=587`
- **AWS SES**: `MAIL_HOST=email-smtp.us-east-1.amazonaws.com`, `MAIL_PORT=587`

## Usage

### Direct Email Sending

```typescript
import { MailService } from './mail/mail.service';

@Injectable()
export class UserService {
  constructor(private readonly mailService: MailService) {}

  async sendWelcome(user: User) {
    await this.mailService.sendWelcomeEmail(user.email, user.username);
  }

  async sendPasswordReset(user: User, resetToken: string) {
    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.username,
      resetToken,
    );
  }

  async sendEmailVerification(user: User, verificationToken: string) {
    await this.mailService.sendEmailVerification(
      user.email,
      user.username,
      verificationToken,
    );
  }
}
```

### Queue-Based Email Sending (Recommended)

For better performance and reliability, use the queue service:

```typescript
import { QueueService } from './bullmq/queue.service';

@Injectable()
export class UserService {
  constructor(private readonly queueService: QueueService) {}

  async sendWelcome(user: User) {
    await this.queueService.addSendWelcomeEmail({
      userId: user.id,
      email: user.email,
      username: user.username,
    });
  }

  async sendCustomEmail(user: User) {
    await this.queueService.addSendEmail({
      to: user.email,
      subject: 'Custom Subject',
      template: 'notification',
      context: {
        userName: user.username,
        notificationTitle: 'Important Update',
        notificationBody: 'Your account has been updated.',
        actionLink: 'https://example.com/view',
      },
    });
  }
}
```

## Available Email Templates

All templates are located in `templates/` directory with multi-language support:

1. **welcome** - Welcome email with account activation
   - Variables: `userName`, `email`, `activationLink`

2. **password-reset** - Password reset request
   - Variables: `userName`, `resetLink`, `expiryTime`

3. **group-invitation** - Group invitation email
   - Variables: `userName`, `groupName`, `inviterName`, `acceptLink`

4. **notification** - General notification email
   - Variables: `userName`, `notificationTitle`, `notificationBody`, `actionLink`

## Retry Mechanism

The email service includes automatic retry with exponential backoff:

- **Attempt 1**: Immediate
- **Attempt 2**: 1 second delay
- **Attempt 3**: 5 seconds delay
- **Attempt 4+**: 30 seconds delay

After 3 failed attempts, emails are moved to the dead-letter queue for manual inspection.

## Queue Management

Monitor and manage email queues using the Bull Board dashboard:

```
http://localhost:3000/admin/queues
```

Features:

- View pending, active, completed, and failed jobs
- Retry failed jobs manually
- View job details and error messages
- Clean old jobs

## Testing

Run the mail service tests:

```bash
npm test -- mail.service.spec.ts
```

Run the email processor tests:

```bash
npm test -- email.processor.spec.ts
```

## Email Verification Workflow

1. User registers → Welcome email sent with verification link
2. User clicks verification link → Email verified
3. User can now access protected features

Example implementation:

```typescript
@Post('register')
async register(@Body() dto: RegisterDto) {
  const user = await this.userService.create(dto);
  const verificationToken = await this.authService.generateVerificationToken(user);

  await this.queueService.addSendEmail({
    to: user.email,
    subject: 'Verify Your Email',
    template: 'welcome',
    context: {
      userName: user.username,
      email: user.email,
      activationLink: `${process.env.APP_URL}/auth/verify-email?token=${verificationToken}`,
    },
  });

  return { message: 'Registration successful. Please check your email.' };
}
```

## Password Reset Workflow

1. User requests password reset → Reset email sent with token
2. User clicks reset link → Redirected to reset password page
3. User submits new password with token → Password updated

Example implementation:

```typescript
@Post('forgot-password')
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  const user = await this.userService.findByEmail(dto.email);
  const resetToken = await this.authService.generateResetToken(user);

  await this.mailService.sendPasswordResetEmail(
    user.email,
    user.username,
    resetToken,
  );

  return { message: 'Password reset email sent.' };
}
```

## Troubleshooting

### Emails not sending

1. Check SMTP credentials in `.env`
2. Verify Redis is running: `redis-cli ping`
3. Check queue status: `http://localhost:3000/admin/queues`
4. Review logs for error messages

### Gmail authentication errors

- Ensure 2FA is enabled
- Use App Password, not regular password
- Check "Less secure app access" is disabled (use App Password instead)

### Template not found errors

- Verify template files exist in `templates/en/` directory
- Check template name matches exactly (case-sensitive)
- Ensure Handlebars syntax is correct in templates

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Controller │────▶│ QueueService │
└─────────────┘     └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  BullMQ/Redis│
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐     ┌─────────────┐
                    │EmailProcessor│────▶│ MailService │
                    └──────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   Nodemailer │
                                         └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ SMTP Server  │
                                         └──────────────┘
```

## Best Practices

1. **Always use queue-based sending** for production to avoid blocking requests
2. **Set appropriate retry limits** based on email importance
3. **Monitor dead-letter queue** regularly for permanently failed emails
4. **Use templates** for consistent branding and easier maintenance
5. **Test emails** in development before deploying to production
6. **Keep sensitive data** out of email templates (use tokens/links instead)
7. **Implement rate limiting** to avoid SMTP provider throttling

## License

MIT
