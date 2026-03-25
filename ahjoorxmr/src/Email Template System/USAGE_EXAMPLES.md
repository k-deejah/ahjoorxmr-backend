# Usage Examples

## Testing the Email Preview Endpoint

Once the server is running (`npm run start`), you can test the preview endpoints:

### 1. Preview Welcome Email (English)

```bash
curl http://localhost:3000/api/v1/admin/email-preview/welcome
```

### 2. Preview Password Reset (Spanish)

```bash
curl http://localhost:3000/api/v1/admin/email-preview/password-reset?lang=es
```

### 3. Preview Group Invitation (French)

```bash
curl http://localhost:3000/api/v1/admin/email-preview/group-invitation?lang=fr
```

### 4. Preview Notification (English)

```bash
curl http://localhost:3000/api/v1/admin/email-preview/notification
```

### 5. List All Available Templates

```bash
curl http://localhost:3000/api/v1/admin/email-templates
```

## Browser Testing

Open these URLs in your browser to see the rendered HTML:

- http://localhost:3000/api/v1/admin/email-preview/welcome
- http://localhost:3000/api/v1/admin/email-preview/password-reset
- http://localhost:3000/api/v1/admin/email-preview/group-invitation?lang=es
- http://localhost:3000/api/v1/admin/email-preview/notification?lang=fr

## Integrating with Your Email Service

```typescript
import { Injectable } from "@nestjs/common";
import { TemplateService } from "./template/template.service";

@Injectable()
export class EmailService {
  constructor(private readonly templateService: TemplateService) {}

  async sendWelcomeEmail(user: any) {
    const html = this.templateService.render(
      "welcome",
      {
        userName: user.name,
        email: user.email,
        activationLink: `https://yourapp.com/activate/${user.activationToken}`,
      },
      user.preferredLanguage || "en",
    );

    // Send email using your email provider (SendGrid, AWS SES, etc.)
    await this.sendEmail({
      to: user.email,
      subject: "Welcome to Our Platform",
      html: html,
    });
  }

  async sendPasswordReset(user: any, resetToken: string) {
    const html = this.templateService.render(
      "password-reset",
      {
        userName: user.name,
        resetLink: `https://yourapp.com/reset/${resetToken}`,
        expiryTime: "24 hours",
      },
      user.preferredLanguage || "en",
    );

    await this.sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html: html,
    });
  }

  async sendGroupInvitation(invitation: any) {
    const html = this.templateService.render(
      "group-invitation",
      {
        userName: invitation.invitee.name,
        groupName: invitation.group.name,
        inviterName: invitation.inviter.name,
        acceptLink: `https://yourapp.com/invitations/${invitation.id}/accept`,
      },
      invitation.invitee.preferredLanguage || "en",
    );

    await this.sendEmail({
      to: invitation.invitee.email,
      subject: `You're invited to join ${invitation.group.name}`,
      html: html,
    });
  }

  private async sendEmail(options: any) {
    // Implement your email sending logic here
    console.log("Sending email:", options);
  }
}
```

## Adding Custom Handlebars Helpers

Edit `src/template/template.service.ts` and add helpers in the `registerHelpers()` method:

```typescript
private registerHelpers(): void {
  Handlebars.registerHelper('formatDate', (date: Date) => {
    return new Date(date).toLocaleDateString();
  });

  Handlebars.registerHelper('uppercase', (str: string) => {
    return str?.toUpperCase();
  });

  // Add your custom helper
  Handlebars.registerHelper('formatCurrency', (amount: number) => {
    return `$${amount.toFixed(2)}`;
  });
}
```

Then use it in your templates:

```handlebars
<p>Total: {{formatCurrency totalAmount}}</p>
```
