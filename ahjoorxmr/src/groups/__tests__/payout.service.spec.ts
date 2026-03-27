import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PayoutService } from '../payout.service';
import { Group } from '../entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { StellarService } from '../../stellar/stellar.service';
import { NotificationsService } from '../../notification/notifications.service';
import { GroupStatus } from '../entities/group-status.enum';
import { NotFoundException, BadRequestException, BadGatewayException, ConflictException } from '@nestjs/common';

describe('PayoutService', () => {
  let service: PayoutService;
  let groupRepo: { findOne: jest.Mock };
  let membershipRepo: { findOne: jest.Mock; save: jest.Mock };
  let stellarService: { disbursePayout: jest.Mock };
  let notificationsService: { notify: jest.Mock };

  const GROUP_ID = 'group-uuid';
  const USER_ID = 'user-uuid';
  const CONTRACT_ADDRESS = 'CCONTRACT123';
  const WALLET_ADDRESS = 'GWALLET456';
  const CONTRIBUTION_AMOUNT = '100';

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn() };
    membershipRepo = { findOne: jest.fn(), save: jest.fn() };
    stellarService = { disbursePayout: jest.fn() };
    notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: StellarService, useValue: stellarService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(PayoutService);
  });

  it('should successfully distribute payout', async () => {
    const group = {
      id: GROUP_ID,
      status: GroupStatus.ACTIVE,
      contractAddress: CONTRACT_ADDRESS,
      contributionAmount: CONTRIBUTION_AMOUNT,
      name: 'Test Group',
    } as Group;

    const recipient = {
      userId: USER_ID,
      walletAddress: WALLET_ADDRESS,
      payoutOrder: 0,
      hasReceivedPayout: false,
    } as Membership;

    const txHash = 'TX_HASH_123';

    groupRepo.findOne.mockResolvedValue(group);
    membershipRepo.findOne.mockResolvedValue(recipient);
    stellarService.disbursePayout.mockResolvedValue(txHash);
    membershipRepo.save.mockResolvedValue({ ...recipient, hasReceivedPayout: true, transactionHash: txHash });

    const result = await service.distributePayout(GROUP_ID, 1);

    expect(result).toBe(txHash);
    expect(stellarService.disbursePayout).toHaveBeenCalledWith(CONTRACT_ADDRESS, WALLET_ADDRESS, CONTRIBUTION_AMOUNT);
    expect(membershipRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      hasReceivedPayout: true,
      transactionHash: txHash,
    }));
    expect(notificationsService.notify).toHaveBeenCalled();
  });

  it('should throw NotFoundException if group not found', async () => {
    groupRepo.findOne.mockResolvedValue(null);
    await expect(service.distributePayout(GROUP_ID, 1)).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if group is not ACTIVE', async () => {
    groupRepo.findOne.mockResolvedValue({ status: GroupStatus.PENDING } as Group);
    await expect(service.distributePayout(GROUP_ID, 1)).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException if no recipient found for round', async () => {
    groupRepo.findOne.mockResolvedValue({ status: GroupStatus.ACTIVE, contractAddress: CONTRACT_ADDRESS } as Group);
    membershipRepo.findOne.mockResolvedValue(null);
    await expect(service.distributePayout(GROUP_ID, 1)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException if member already received payout', async () => {
    groupRepo.findOne.mockResolvedValue({ status: GroupStatus.ACTIVE, contractAddress: CONTRACT_ADDRESS } as Group);
    membershipRepo.findOne.mockResolvedValue({ hasReceivedPayout: true } as Membership);
    await expect(service.distributePayout(GROUP_ID, 1)).rejects.toThrow(ConflictException);
  });

  it('should throw BadGatewayException if contract invocation fails', async () => {
    groupRepo.findOne.mockResolvedValue({ status: GroupStatus.ACTIVE, contractAddress: CONTRACT_ADDRESS, contributionAmount: CONTRIBUTION_AMOUNT } as Group);
    membershipRepo.findOne.mockResolvedValue({ hasReceivedPayout: false, walletAddress: WALLET_ADDRESS } as Membership);
    stellarService.disbursePayout.mockRejectedValue(new Error('Stellar Error'));

    await expect(service.distributePayout(GROUP_ID, 1)).rejects.toThrow(BadGatewayException);
  });
});
