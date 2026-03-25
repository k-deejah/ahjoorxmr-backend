# Email Template System for NestJS

A flexible email template system with Handlebars templating, multi-language support, and HTML rendering with inline CSS.

## Features

- ✅ HTML email templates with proper styling
- ✅ Variable substitution using Handlebars ({{userName}}, {{groupName}}, etc.)
- ✅ Admin preview endpoint for testing templates
- ✅ Multi-language support (English, Spanish, French)
- ✅ Mobile-responsive design
- ✅ Inline CSS for email client compatibility

## Installation

```bash
npm install
```

## Running the Application

```bash
npm run start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Preview Email Template

```
GET /api/v1/admin/email-preview/:template?lang=en
```

Parameters:

- `template` (path): Template name (welcome, password-reset, group-invitation, notification)
- `lang` (query): Language code (en, es, fr) - defaults to 'en'

Examples:

```bash
# Preview welcome email in English
http://localhost:3000/api/v1/admin/email-preview/welcome

# Preview password reset in Spanish
http://localhost:3000/api/v1/admin/email-preview/password-reset?lang=es

# Preview group invitation in French
http://localhost:3000/api/v1/admin/email-preview/group-invitation?lang=fr
```

### List Available Templates

```
GET /api/v1/admin/email-templates
```

Returns all available template names with their languages.

## Available Templates

1. **welcome** - Welcome email with account activation
   - Variables: `userName`, `email`, `activationLink`

2. **password-reset** - Password reset request
   - Variables: `userName`, `resetLink`, `expiryTime`

3. **group-invitation** - Group invitation email
   - Variables: `userName`, `groupName`, `inviterName`, `acceptLink`

4. **notification** - General notification email
   - Variables: `userName`, `notificationTitle`, `notificationBody`, `actionLink`

## Template Structure

```
templates/
├── en/
│   ├── welcome.hbs
│   ├── password-reset.hbs
│   ├── group-invitation.hbs
│   └── notification.hbs
├── es/
│   ├── welcome.hbs
│   ├── password-reset.hbs
│   ├── group-invitation.hbs
│   └── notification.hbs
└── fr/
    ├── welcome.hbs
    ├── password-reset.hbs
    ├── group-invitation.hbs
    └── notification.hbs
```

## Using the Template Service

```typescript
import { TemplateService } from './template/template.service';

// Inject the service
constructor(private readonly templateService: TemplateService) {}

// Render a template
const html = this.templateService.render('welcome', {
  userName: 'John Doe',
  email: 'john@example.com',
  activationLink: 'https://example.com/activate/abc123'
}, 'en');
```

## Adding New Templates

1. Create a new `.hbs` file in the appropriate language folder under `templates/`
2. Use Handlebars syntax for variables: `{{variableName}}`
3. Include inline CSS for email client compatibility
4. Use table-based layout for maximum compatibility
5. The service will automatically load the template on startup

## Handlebars Helpers

The system includes custom Handlebars helpers:

- `formatDate` - Format dates: `{{formatDate myDate}}`
- `uppercase` - Convert to uppercase: `{{uppercase myString}}`

## Email Client Compatibility

All templates use:

- Inline CSS styles
- Table-based layouts
- Mobile-responsive design with max-width
- Web-safe fonts (Arial, sans-serif)
- Tested color schemes

## Acceptance Criteria Status

✅ All emails use HTML templates with proper styling  
✅ Templates support variable substitution ({{userName}}, {{groupName}})  
✅ Admin can preview templates without sending emails  
✅ Templates are mobile-responsive  
✅ Multi-language support (i18n)  
✅ Inline CSS for email client compatibility
