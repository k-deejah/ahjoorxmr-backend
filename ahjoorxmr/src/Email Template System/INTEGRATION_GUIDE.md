# Integration Guide

## Adding to an Existing NestJS Project

### Step 1: Install Dependencies

```bash
npm install handlebars
```

### Step 2: Copy Files

Copy these directories and files to your project:

```
your-project/
├── src/
│   └── template/
│       ├── template.controller.ts
│       ├── template.service.ts
│       └── template.module.ts
└── templates/
    ├── en/
    ├── es/
    └── fr/
```

### Step 3: Import TemplateModule

In your `app.module.ts` or feature module:

```typescript
import { Module } from "@nestjs/common";
import { TemplateModule } from "./template/template.module";

@Module({
  imports: [
    TemplateModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### Step 4: Use in Your Services

```typescript
import { Injectable } from "@nestjs/common";
import { TemplateService } from "./template/template.service";

@Injectable()
export class YourService {
  constructor(private readonly templateService: TemplateService) {}

  async sendEmail() {
    const html = this.templateService.render(
      "welcome",
      {
        userName: "John Doe",
        activationLink: "https://example.com/activate/123",
      },
      "en",
    );

    // Use html with your email provider
  }
}
```

## Customization Options

### 1. Add New Languages

Create a new language folder under `templates/`:

```
templates/
└── de/  (German)
    ├── welcome.hbs
    ├── password-reset.hbs
    └── ...
```

Update the `loadTemplates()` method in `template.service.ts`:

```typescript
private loadTemplates(): void {
  const languages = ['en', 'es', 'fr', 'de']; // Add 'de'
  // ...
}
```

### 2. Add New Templates

1. Create template files in each language folder:
   - `templates/en/order-confirmation.hbs`
   - `templates/es/order-confirmation.hbs`
   - `templates/fr/order-confirmation.hbs`

2. Add template name to the service:

```typescript
const templateNames = [
  "welcome",
  "password-reset",
  "group-invitation",
  "notification",
  "order-confirmation", // New template
];
```

3. Add mock data in controller (optional):

```typescript
private getMockData(template: string): any {
  const mockDataMap = {
    // ... existing templates
    'order-confirmation': {
      userName: 'John Doe',
      orderNumber: 'ORD-12345',
      orderTotal: '$99.99',
      items: ['Product 1', 'Product 2']
    }
  };
  return mockDataMap[template] || { userName: 'Test User' };
}
```

### 3. Customize Email Styles

Edit the inline styles in your `.hbs` templates. Key areas:

- Header background: `background-color: #4CAF50;`
- Button color: `background-color: #4CAF50;`
- Text colors: `color: #333333;`
- Font family: `font-family: Arial, sans-serif;`

### 4. Add Partials (Reusable Components)

Create a partial for common elements:

```typescript
// In template.service.ts constructor
Handlebars.registerPartial(
  "footer",
  `
  <tr>
    <td style="padding: 20px; text-align: center; background-color: #f9f9f9;">
      <p style="margin: 0; color: #999999; font-size: 12px;">
        © 2024 Your Company. All rights reserved.
      </p>
    </td>
  </tr>
`,
);
```

Use in templates:

```handlebars
{{> footer}}
```

## Security Considerations

1. **Sanitize User Input**: Always sanitize data before passing to templates
2. **Validate Template Names**: The controller validates template existence
3. **Rate Limiting**: Add rate limiting to preview endpoints in production
4. **Access Control**: Restrict admin endpoints to authorized users only

## Production Deployment

### 1. Environment Variables

```typescript
// template.service.ts
private templatesPath = process.env.TEMPLATES_PATH || path.join(process.cwd(), 'templates');
```

### 2. Template Caching

Templates are loaded once at startup for performance. To reload:

```typescript
// Add a method to reload templates
reloadTemplates(): void {
  this.templates.clear();
  this.loadTemplates();
}
```

### 3. Error Handling

Add proper error handling:

```typescript
render(templateName: string, data: any, language: string = 'en'): string {
  try {
    const key = `${language}:${templateName}`;
    const template = this.templates.get(key);

    if (!template) {
      // Fallback to English if language not found
      const fallbackKey = `en:${templateName}`;
      const fallbackTemplate = this.templates.get(fallbackKey);

      if (!fallbackTemplate) {
        throw new Error(`Template ${templateName} not found`);
      }

      return fallbackTemplate(data);
    }

    return template(data);
  } catch (error) {
    console.error('Template rendering error:', error);
    throw error;
  }
}
```

## Testing

Create unit tests for the template service:

```typescript
import { Test } from "@nestjs/testing";
import { TemplateService } from "./template.service";

describe("TemplateService", () => {
  let service: TemplateService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TemplateService],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  it("should render welcome template", () => {
    const html = service.render(
      "welcome",
      {
        userName: "Test User",
        activationLink: "https://test.com",
      },
      "en",
    );

    expect(html).toContain("Test User");
    expect(html).toContain("https://test.com");
  });

  it("should throw error for non-existent template", () => {
    expect(() => {
      service.render("non-existent", {}, "en");
    }).toThrow();
  });
});
```
