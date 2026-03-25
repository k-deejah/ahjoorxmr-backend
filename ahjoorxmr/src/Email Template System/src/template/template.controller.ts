import { Controller, Get, Param, Query, Version } from '@nestjs/common';
import { TemplateService } from './template.service';

@Controller('admin')
@Version('1')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get('email-preview/:template')
  previewTemplate(
    @Param('template') template: string,
    @Query('lang') lang: string = 'en',
  ) {
    const mockData = this.getMockData(template);

    try {
      const html = this.templateService.render(template, mockData, lang);
      return {
        success: true,
        template,
        language: lang,
        html,
        data: mockData,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        availableTemplates: this.templateService.getAvailableTemplates(),
      };
    }
  }

  @Get('email-templates')
  listTemplates() {
    return {
      templates: this.templateService.getAvailableTemplates(),
    };
  }

  private getMockData(template: string): any {
    const mockDataMap = {
      welcome: {
        userName: 'John Doe',
        email: 'john@example.com',
        activationLink: 'https://example.com/activate/abc123',
      },
      'password-reset': {
        userName: 'Jane Smith',
        resetLink: 'https://example.com/reset/xyz789',
        expiryTime: '24 hours',
      },
      'group-invitation': {
        userName: 'Bob Johnson',
        groupName: 'Development Team',
        inviterName: 'Alice Williams',
        acceptLink: 'https://example.com/accept/inv456',
      },
      notification: {
        userName: 'Charlie Brown',
        notificationTitle: 'New Message',
        notificationBody: 'You have received a new message from your team.',
        actionLink: 'https://example.com/messages',
      },
    };

    return mockDataMap[template] || { userName: 'Test User' };
  }
}
