import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KycStatus } from './kyc.constants';
import { UpdateKycStatusDto } from './kyc.dto';
import { KycNotificationService } from './kyc-notification.service';
import { KycService } from './kyc.service';

const mockUserRepository = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockNotificationService = {
  emitApproved: jest.fn(),
  emitRejected: jest.fn(),
};

describe('KycService', () => {
  let service: KycService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: 'UserRepository', useValue: mockUserRepository },
        { provide: KycNotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
    jest.clearAllMocks();
  });

  // ─── updateKycStatus ─────────────────────────────────────────────────────────

  describe('updateKycStatus', () => {
    const adminId = 'admin-abc';
    const userId = 'user-123';

    it('approves a PENDING user and emits approved event', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, kycStatus: KycStatus.PENDING });
      mockUserRepository.update.mockResolvedValue(undefined);

      const dto: UpdateKycStatusDto = { status: KycStatus.APPROVED, reason: 'Docs verified' };
      const result = await service.updateKycStatus(userId, dto, adminId);

      expect(result.kycStatus).toBe(KycStatus.APPROVED);
      expect(result.userId).toBe(userId);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ kycStatus: KycStatus.APPROVED, kycReviewedBy: adminId }),
      );
      expect(mockNotificationService.emitApproved).toHaveBeenCalledWith(userId, 'Docs verified');
      expect(mockNotificationService.emitRejected).not.toHaveBeenCalled();
    });

    it('rejects a PENDING user and emits rejected event', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, kycStatus: KycStatus.PENDING });
      mockUserRepository.update.mockResolvedValue(undefined);

      const dto: UpdateKycStatusDto = { status: KycStatus.REJECTED, reason: 'ID mismatch' };
      const result = await service.updateKycStatus(userId, dto, adminId);

      expect(result.kycStatus).toBe(KycStatus.REJECTED);
      expect(mockNotificationService.emitRejected).toHaveBeenCalledWith(userId, 'ID mismatch');
      expect(mockNotificationService.emitApproved).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const dto: UpdateKycStatusDto = { status: KycStatus.APPROVED };

      await expect(
        service.updateKycStatus('non-existent', dto, adminId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when status is already the target value', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, kycStatus: KycStatus.APPROVED });
      const dto: UpdateKycStatusDto = { status: KycStatus.APPROVED };

      await expect(
        service.updateKycStatus(userId, dto, adminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('works without an optional reason', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, kycStatus: KycStatus.PENDING });
      mockUserRepository.update.mockResolvedValue(undefined);

      const dto: UpdateKycStatusDto = { status: KycStatus.APPROVED };
      const result = await service.updateKycStatus(userId, dto, adminId);

      expect(result.reason).toBeUndefined();
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ kycReason: null }),
      );
    });
  });

  // ─── getKycStatus ─────────────────────────────────────────────────────────────

  describe('getKycStatus', () => {
    it('returns current KYC status for existing user', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-1',
        kycStatus: KycStatus.PENDING,
        kycReason: null,
        kycReviewedAt: null,
      });

      const result = await service.getKycStatus('user-1');
      expect(result.kycStatus).toBe(KycStatus.PENDING);
    });

    it('throws NotFoundException for unknown user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.getKycStatus('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
