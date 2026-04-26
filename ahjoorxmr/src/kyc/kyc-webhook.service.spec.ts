// Avoid pulling in @nestjs-modules/mailer (not installed in this project)
jest.mock('../notification/notifications.service');

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { KycWebhookService } from './kyc-webhook.service';
import { KycProviderFactory } from './providers/kyc-provider.factory';
import { NotificationsService } from '../notification/notifications.service';
import { User } from '../users/entities/user.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { AuditLog } from './entities/audit-log.entity';
import { KycStatus } from './enums/kyc-status.enum';
import { KycProvider } from './enums/kyc-provider.enum';
import { NotificationType } from '../notification/enums/notification-type.enum';

const mockUser = (): User =>
  ({
    id: 'user-uuid-1',
    email: 'user@example.com',
    kycStatus: KycStatus.PENDING,
    walletAddress: null,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User);

const mockParsedPayload = {
  userId: 'user-uuid-1',
  providerReferenceId: 'inq_abc123',
  status: KycStatus.APPROVED,
  raw: { data: { id: 'inq_abc123' } },
};

describe('KycWebhookService', () => {
  let service: KycWebhookService;
  let userRepo: { findOne: jest.Mock; save: jest.Mock };
  let kycDocRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let auditLogRepo: { save: jest.Mock; create: jest.Mock };
  let providerFactory: { getParser: jest.Mock };
  let notificationsService: { notify: jest.Mock };
  let mockParser: { validateSignature: jest.Mock; parse: jest.Mock };

  beforeEach(async () => {
    mockParser = { validateSignature: jest.fn(), parse: jest.fn().mockReturnValue(mockParsedPayload) };
    providerFactory = { getParser: jest.fn().mockReturnValue(mockParser) };
    notificationsService = { notify: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycWebhookService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(KycDocument),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { save: jest.fn(), create: jest.fn((x: unknown) => x) },
        },
        { provide: KycProviderFactory, useValue: providerFactory },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(KycProvider.PERSONA) },
        },
      ],
    }).compile();

    service = module.get(KycWebhookService);
    userRepo = module.get(getRepositoryToken(User));
    kycDocRepo = module.get(getRepositoryToken(KycDocument));
    auditLogRepo = module.get(getRepositoryToken(AuditLog));
  });

  it('updates User.kycStatus on approved webhook', async () => {
    const user = mockUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue({ ...user, kycStatus: KycStatus.APPROVED });
    kycDocRepo.findOne.mockResolvedValue(null);
    kycDocRepo.create.mockReturnValue({ userId: user.id } as KycDocument);
    kycDocRepo.save.mockResolvedValue({} as KycDocument);
    auditLogRepo.save.mockResolvedValue({} as AuditLog);

    await service.processWebhook(Buffer.from('{}'));

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kycStatus: KycStatus.APPROVED }),
    );
  });

  it('writes an AuditLog entry with KYC_STATUS_UPDATED eventType', async () => {
    const user = mockUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(user);
    kycDocRepo.findOne.mockResolvedValue(null);
    kycDocRepo.create.mockReturnValue({} as KycDocument);
    kycDocRepo.save.mockResolvedValue({} as KycDocument);
    auditLogRepo.save.mockResolvedValue({} as AuditLog);

    await service.processWebhook(Buffer.from('{}'));

    expect(auditLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'KYC_STATUS_UPDATED',
        userId: 'user-uuid-1',
        metadata: expect.objectContaining({ providerReferenceId: 'inq_abc123' }),
      }),
    );
  });

  it('sends KYC_APPROVED email when status is approved', async () => {
    const user = mockUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(user);
    kycDocRepo.findOne.mockResolvedValue(null);
    kycDocRepo.create.mockReturnValue({} as KycDocument);
    kycDocRepo.save.mockResolvedValue({} as KycDocument);
    auditLogRepo.save.mockResolvedValue({} as AuditLog);

    await service.processWebhook(Buffer.from('{}'));

    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.KYC_APPROVED,
        emailTo: user.email,
        sendEmail: true,
      }),
    );
  });

  it('sends KYC_DECLINED email when status is declined', async () => {
    mockParser.parse.mockReturnValue({ ...mockParsedPayload, status: KycStatus.DECLINED });

    const user = mockUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(user);
    kycDocRepo.findOne.mockResolvedValue(null);
    kycDocRepo.create.mockReturnValue({} as KycDocument);
    kycDocRepo.save.mockResolvedValue({} as KycDocument);
    auditLogRepo.save.mockResolvedValue({} as AuditLog);

    await service.processWebhook(Buffer.from('{}'));

    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.KYC_DECLINED }),
    );
  });

  it('does NOT send email for needs_review status', async () => {
    mockParser.parse.mockReturnValue({ ...mockParsedPayload, status: KycStatus.NEEDS_REVIEW });

    const user = mockUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(user);
    kycDocRepo.findOne.mockResolvedValue(null);
    kycDocRepo.create.mockReturnValue({} as KycDocument);
    kycDocRepo.save.mockResolvedValue({} as KycDocument);
    auditLogRepo.save.mockResolvedValue({} as AuditLog);

    await service.processWebhook(Buffer.from('{}'));

    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.processWebhook(Buffer.from('{}'))).rejects.toThrow(NotFoundException);
  });
});
