import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

describe('MailService', () => {
  let service: MailService;
  let mailerService: MailerService;
  let configService: ConfigService;

  const mockMailerService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        APP_URL: 'http://localhost:3000',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    mailerService = module.get<MailerService>(MailerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMail', () => {
    it('should send email successfully', async () => {
      const options = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      };

      await service.sendMail(options);

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: options.to,
        subject: options.subject,
        template: undefined,
        context: undefined,
        html: options.html,
        text: undefined,
      });
    });

    it('should send email with template', async () => {
      const options = {
        to: 'test@example.com',
        subject: 'Test Subject',
        template: 'welcome',
        context: { userName: 'John' },
      };

      await service.sendMail(options);

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: options.to,
        subject: options.subject,
        template: 'en/welcome',
        context: options.context,
        html: undefined,
        text: undefined,
      });
    });

    it('should throw error when sending fails', async () => {
      mockMailerService.sendMail.mockRejectedValueOnce(
        new Error('Send failed'),
      );

      const options = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      };

      await expect(service.sendMail(options)).rejects.toThrow('Send failed');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email', async () => {
      await service.sendWelcomeEmail('test@example.com', 'John Doe');

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome to Ahjoorxmr!',
          template: 'en/welcome',
          context: expect.objectContaining({
            userName: 'John Doe',
            email: 'test@example.com',
          }),
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email', async () => {
      await service.sendPasswordResetEmail(
        'test@example.com',
        'John Doe',
        'reset-token-123',
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Password Reset Request',
          template: 'en/password-reset',
          context: expect.objectContaining({
            userName: 'John Doe',
            resetLink: expect.stringContaining('reset-token-123'),
            expiryTime: '1 hour',
          }),
        }),
      );
    });
  });

  describe('sendEmailVerification', () => {
    it('should send email verification', async () => {
      await service.sendEmailVerification(
        'test@example.com',
        'John Doe',
        'verify-token-123',
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Verify Your Email Address',
          template: 'en/welcome',
          context: expect.objectContaining({
            userName: 'John Doe',
            email: 'test@example.com',
            activationLink: expect.stringContaining('verify-token-123'),
          }),
        }),
      );
    });
  });

  describe('sendGroupInvitationEmail', () => {
    it('should send group invitation email', async () => {
      await service.sendGroupInvitationEmail(
        'test@example.com',
        'John Doe',
        'Test Group',
        'Jane Smith',
        'invite-token-123',
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: "You've been invited to join Test Group",
          template: 'en/group-invitation',
          context: expect.objectContaining({
            userName: 'John Doe',
            groupName: 'Test Group',
            inviterName: 'Jane Smith',
            acceptLink: expect.stringContaining('invite-token-123'),
          }),
        }),
      );
    });
  });

  describe('sendNotificationEmail', () => {
    it('should send notification email', async () => {
      await service.sendNotificationEmail(
        'test@example.com',
        'John Doe',
        'Test Notification',
        'This is a test notification',
        'http://localhost:3000/action',
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Notification',
          template: 'en/notification',
          context: expect.objectContaining({
            userName: 'John Doe',
            notificationTitle: 'Test Notification',
            notificationBody: 'This is a test notification',
            actionLink: 'http://localhost:3000/action',
          }),
        }),
      );
    });

    it('should send notification email without action link', async () => {
      await service.sendNotificationEmail(
        'test@example.com',
        'John Doe',
        'Test Notification',
        'This is a test notification',
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            actionLink: '#',
          }),
        }),
      );
    });
  });
});
