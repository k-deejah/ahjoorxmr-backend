import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KycAdminController } from './kyc-admin.controller';
import { KycStatus } from './kyc.constants';
import { UpdateKycStatusDto } from './kyc.dto';
import { KycService } from './kyc.service';

const mockKycService = {
  updateKycStatus: jest.fn(),
  getKycStatus: jest.fn(),
};

const mockAdminRequest = { user: { sub: 'admin-001' } };

describe('KycAdminController', () => {
  let controller: KycAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycAdminController],
      providers: [{ provide: KycService, useValue: mockKycService }],
    }).compile();

    controller = module.get<KycAdminController>(KycAdminController);
    jest.clearAllMocks();
  });

  describe('PATCH /admin/users/:id/kyc', () => {
    it('delegates to KycService and returns the result', async () => {
      const userId = 'user-xyz';
      const dto: UpdateKycStatusDto = { status: KycStatus.APPROVED, reason: 'All clear' };
      const expected = { userId, kycStatus: KycStatus.APPROVED, reason: 'All clear', updatedAt: new Date() };

      mockKycService.updateKycStatus.mockResolvedValue(expected);

      const result = await controller.updateKycStatus(userId, dto, mockAdminRequest);

      expect(mockKycService.updateKycStatus).toHaveBeenCalledWith(userId, dto, 'admin-001');
      expect(result).toEqual(expected);
    });

    it('propagates NotFoundException from service when user is not found', async () => {
      mockKycService.updateKycStatus.mockRejectedValue(new NotFoundException('User not found'));
      const dto: UpdateKycStatusDto = { status: KycStatus.REJECTED, reason: 'Fake docs' };

      await expect(
        controller.updateKycStatus('missing-id', dto, mockAdminRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /admin/users/:id/kyc', () => {
    it('returns KYC status for a known user', async () => {
      const expected = { userId: 'user-1', kycStatus: KycStatus.PENDING, updatedAt: new Date() };
      mockKycService.getKycStatus.mockResolvedValue(expected);

      const result = await controller.getKycStatus('user-1');
      expect(result).toEqual(expected);
    });

    it('propagates NotFoundException for unknown user', async () => {
      mockKycService.getKycStatus.mockRejectedValue(new NotFoundException());
      await expect(controller.getKycStatus('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
