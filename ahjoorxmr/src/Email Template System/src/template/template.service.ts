import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TemplateService {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private templatesPath = path.join(process.cwd(), 'templates');

  constructor() {
    this.loadTemplates();
    this.registerHelpers();
  }

  private loadTemplates(): void {
    const languages = ['en', 'es', 'fr'];
    const templateNames = [
      'welcome',
      'password-reset',
      'group-invitation',
      'notification',
    ];

    languages.forEach((lang) => {
      templateNames.forEach((name) => {
        const templatePath = path.join(this.templatesPath, lang, `${name}.hbs`);
        if (fs.existsSync(templatePath)) {
          const templateContent = fs.readFileSync(templatePath, 'utf-8');
          this.templates.set(
            `${lang}:${name}`,
            Handlebars.compile(templateContent),
          );
        }
      });
    });
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });

    Handlebars.registerHelper('uppercase', (str: string) => {
      return str?.toUpperCase();
    });
  }

  render(templateName: string, data: any, language: string = 'en'): string {
    const key = `${language}:${templateName}`;
    const template = this.templates.get(key);

    if (!template) {
      throw new Error(
        `Template ${templateName} not found for language ${language}`,
      );
    }

    return template(data);
  }

  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }
}
