import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, TooManyRequestsException } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { User } from './entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { RedisService } from '../common/redis/redis.service';

const mockUser = {
  id: 'user-uuid',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  walletAddress: 'GTEST',
};

describe('GdprService (issue #232)', () => {
  let service: GdprService;
  let userRepo: any;
  let auditLogRepo: any;
  let membershipRepo: any;
  let groupRepo: any;
  let redisService: any;
  let gdprQueue: any;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    auditLogRepo = {
      save: jest.fn(),
      create: jest.fn((v) => v),
    };
    membershipRepo = { find: jest.fn().mockResolvedValue([]) };
    groupRepo = { findOne: jest.fn() };
    redisService = {
      exists: jest.fn().mockResolvedValue(false),
      setWithExpiry: jest.fn(),
      ttl: jest.fn().mockResolvedValue(86400 * 5),
    };
    gdprQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: 'BullQueue_gdpr-queue', useValue: gdprQueue },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<GdprService>(GdprService);
  });

  describe('requestDataExport', () => {
    it('queues a data export job and records audit log', async () => {
      await service.requestDataExport('user-uuid', '127.0.0.1');
      expect(gdprQueue.add).toHaveBeenCalledWith('data-export', { userId: 'user-uuid' }, expect.any(Object));
      expect(auditLogRepo.save).toHaveBeenCalled();
    });

    it('rate-limits to 1 request per 30 days', async () => {
      redisService.exists.mockResolvedValue(true);
      await expect(service.requestDataExport('user-uuid', '127.0.0.1')).rejects.toThrow(TooManyRequestsException);
    });
  });

  describe('requestErasure', () => {
    it('queues erasure job and records audit log', async () => {
      await service.requestErasure('user-uuid', '127.0.0.1');
      expect(gdprQueue.add).toHaveBeenCalledWith('right-to-erasure', { userId: 'user-uuid' }, expect.any(Object));
      expect(auditLogRepo.save).toHaveBeenCalled();
    });

    it('blocks erasure when user is active payout beneficiary', async () => {
      const membership = { userId: 'user-uuid', groupId: 'group-uuid', payoutOrder: 0, hasReceivedPayout: false };
      const group = { id: 'group-uuid', status: GroupStatus.ACTIVE, currentRound: 1, endDate: null, staleAt: null };
      membershipRepo.find.mockResolvedValue([membership]);
      groupRepo.findOne.mockResolvedValue(group);

      await expect(service.requestErasure('user-uuid', '127.0.0.1')).rejects.toThrow(ConflictException);
    });

    it('allows erasure when user has already received payout', async () => {
      const membership = { userId: 'user-uuid', groupId: 'group-uuid', payoutOrder: 0, hasReceivedPayout: true };
      const group = { id: 'group-uuid', status: GroupStatus.ACTIVE, currentRound: 1, endDate: null, staleAt: null };
      membershipRepo.find.mockResolvedValue([membership]);
      groupRepo.findOne.mockResolvedValue(group);

      await expect(service.requestErasure('user-uuid', '127.0.0.1')).resolves.not.toThrow();
    });
  });

  describe('anonymizeUser', () => {
    it('anonymizes PII fields correctly', async () => {
      await service.anonymizeUser('user-uuid');

      expect(userRepo.update).toHaveBeenCalledWith(
        'user-uuid',
        expect.objectContaining({
          firstName: 'DELETED',
          lastName: 'DELETED',
          username: null,
          isActive: false,
        }),
      );

      const updateCall = userRepo.update.mock.calls[0][1];
      expect(updateCall.email).toMatch(/@erased\.invalid$/);
      expect(updateCall.walletAddress).toMatch(/^ERASED_/);
    });
  });
});
