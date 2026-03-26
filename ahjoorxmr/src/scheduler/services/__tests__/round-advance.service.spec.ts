import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RoundAdvanceService } from '../round-advance.service';
import { Group } from '../../../groups/entities/group.entity';
import { GroupStatus } from '../../../groups/entities/group-status.enum';
import { Membership } from '../../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../../memberships/entities/membership-status.enum';
import { NotificationsService } from '../../../notification/notifications.service';
import { NotificationType } from '../../../notification/notification-type.enum';

const NOW = new Date('2025-01-10T12:00:00Z');

/** Build a minimal Group with sensible defaults */
const makeGroup = (overrides: Partial<Group> = {}): Group =>
  ({
    id: 'group-1',
    name: 'Test Group',
    adminWallet: 'GADMIN',
    contributionAmount: '100',
    token: 'USDC',
    roundDuration: 3600, // 1 hour in seconds
    status: GroupStatus.ACTIVE,
    currentRound: 1,
    totalRounds: 5,
    minMembers: 2,
    maxMembers: 10,
    staleAt: null,
    deletedAt: null,
    contractAddress: null,
    // updatedAt 2 hours ago → deadline already passed
    updatedAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
    createdAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
    memberships: [],
    ...overrides,
  } as Group);

/** Build a minimal Membership */
const makeMember = (overrides: Partial<Membership> = {}): Membership =>
  ({
    id: 'mem-1',
    groupId: 'group-1',
    userId: 'user-1',
    walletAddress: 'WUSER1',
    payoutOrder: 1,
    hasReceivedPayout: false,
    hasPaidCurrentRound: true,
    contributionsMade: 1,
    transactionHash: null,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Membership);

describe('RoundAdvanceService', () => {
  let service: RoundAdvanceService;
  let groupRepo: { find: jest.Mock; save: jest.Mock };
  let membershipRepo: { save: jest.Mock };
  let notificationsService: { notifyBatch: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    groupRepo = { find: jest.fn(), save: jest.fn().mockImplementation((g) => Promise.resolve(g)) };
    membershipRepo = { save: jest.fn().mockResolvedValue([]) };
    notificationsService = { notifyBatch: jest.fn().mockResolvedValue([]) };
    configService = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'ROUND_GRACE_PERIOD_HOURS') return 0;
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoundAdvanceService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(RoundAdvanceService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── isDeadlinePassed ────────────────────────────────────────────────────────

  describe('isDeadlinePassed', () => {
    it('returns true when deadline has passed', () => {
      const group = makeGroup(); // updatedAt 2h ago, roundDuration 1h
      expect(service.isDeadlinePassed(group, NOW, 0)).toBe(true);
    });

    it('returns false when deadline has not passed', () => {
      const group = makeGroup({
        updatedAt: new Date(NOW.getTime() - 30 * 60 * 1000), // 30 min ago
      });
      expect(service.isDeadlinePassed(group, NOW, 0)).toBe(false);
    });

    it('respects grace period', () => {
      // updatedAt 90 min ago, roundDuration 1h → base deadline passed 30 min ago
      // but with 1h grace period, effective deadline is 30 min in the future
      const group = makeGroup({
        updatedAt: new Date(NOW.getTime() - 90 * 60 * 1000),
      });
      expect(service.isDeadlinePassed(group, NOW, 1)).toBe(false);
    });

    it('returns true when grace period is also exhausted', () => {
      // updatedAt 3h ago, roundDuration 1h, grace 1h → deadline was 1h ago
      const group = makeGroup({
        updatedAt: new Date(NOW.getTime() - 3 * 3600 * 1000),
      });
      expect(service.isDeadlinePassed(group, NOW, 1)).toBe(true);
    });
  });

  // ─── processDeadlinedGroups ──────────────────────────────────────────────────

  describe('processDeadlinedGroups', () => {
    it('advances a group when all members have paid', async () => {
      const member = makeMember({ hasPaidCurrentRound: true });
      const group = makeGroup({ memberships: [member] });
      groupRepo.find.mockResolvedValue([group]);

      const result = await service.processDeadlinedGroups();

      expect(result.advanced).toBe(1);
      expect(result.reminded).toBe(0);
      expect(result.errors).toBe(0);
      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentRound: 2 }),
      );
    });

    it('sends payment reminders when members have not paid', async () => {
      const unpaid = makeMember({ userId: 'user-1', hasPaidCurrentRound: false });
      const group = makeGroup({ memberships: [unpaid] });
      groupRepo.find.mockResolvedValue([group]);

      const result = await service.processDeadlinedGroups();

      expect(result.advanced).toBe(0);
      expect(result.reminded).toBe(1);
      expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            type: NotificationType.PAYMENT_REMINDER,
          }),
        ]),
      );
      // Group should NOT be advanced
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('skips groups whose deadline has not passed', async () => {
      const group = makeGroup({
        updatedAt: new Date(NOW.getTime() - 10 * 60 * 1000), // only 10 min ago
      });
      groupRepo.find.mockResolvedValue([group]);

      const result = await service.processDeadlinedGroups();

      expect(result.advanced).toBe(0);
      expect(result.reminded).toBe(0);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('marks group COMPLETED when advancing past totalRounds', async () => {
      const member = makeMember({ hasPaidCurrentRound: true });
      const group = makeGroup({ currentRound: 5, totalRounds: 5, memberships: [member] });
      groupRepo.find.mockResolvedValue([group]);

      await service.processDeadlinedGroups();

      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: GroupStatus.COMPLETED, currentRound: 6 }),
      );
      // No ROUND_OPENED notifications for completed group
      expect(notificationsService.notifyBatch).not.toHaveBeenCalled();
    });

    it('clears staleAt when advancing', async () => {
      const member = makeMember({ hasPaidCurrentRound: true });
      const group = makeGroup({ staleAt: new Date(), memberships: [member] });
      groupRepo.find.mockResolvedValue([group]);

      await service.processDeadlinedGroups();

      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ staleAt: null }),
      );
    });

    it('resets hasPaidCurrentRound for all active members on advance', async () => {
      const m1 = makeMember({ id: 'mem-1', userId: 'user-1', hasPaidCurrentRound: true });
      const m2 = makeMember({ id: 'mem-2', userId: 'user-2', hasPaidCurrentRound: true });
      const group = makeGroup({ memberships: [m1, m2] });
      groupRepo.find.mockResolvedValue([group]);

      await service.processDeadlinedGroups();

      expect(membershipRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ hasPaidCurrentRound: false }),
          expect.objectContaining({ hasPaidCurrentRound: false }),
        ]),
      );
    });

    it('sends ROUND_OPENED notifications to all active members on advance', async () => {
      const m1 = makeMember({ id: 'mem-1', userId: 'user-1', hasPaidCurrentRound: true });
      const m2 = makeMember({ id: 'mem-2', userId: 'user-2', hasPaidCurrentRound: true });
      const group = makeGroup({ memberships: [m1, m2] });
      groupRepo.find.mockResolvedValue([group]);

      await service.processDeadlinedGroups();

      expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1', type: NotificationType.ROUND_OPENED }),
          expect.objectContaining({ userId: 'user-2', type: NotificationType.ROUND_OPENED }),
        ]),
      );
    });

    it('uses idempotency keys to prevent duplicate notifications', async () => {
      const member = makeMember({ userId: 'user-1', hasPaidCurrentRound: false });
      const group = makeGroup({ id: 'group-1', currentRound: 2, memberships: [member] });
      groupRepo.find.mockResolvedValue([group]);

      await service.processDeadlinedGroups();

      expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey: 'group-1-2-user-1-PAYMENT_REMINDER',
          }),
        ]),
      );
    });

    it('is idempotent — running twice does not double-advance', async () => {
      const member = makeMember({ hasPaidCurrentRound: true });
      const group = makeGroup({ memberships: [member] });

      // First call: group is eligible
      groupRepo.find.mockResolvedValueOnce([group]);
      await service.processDeadlinedGroups();

      // Simulate the group now having updatedAt = NOW (just advanced)
      const advancedGroup = makeGroup({
        currentRound: 2,
        updatedAt: NOW, // just updated — deadline not passed yet
        memberships: [member],
      });
      groupRepo.find.mockResolvedValueOnce([advancedGroup]);

      const result2 = await service.processDeadlinedGroups();

      expect(result2.advanced).toBe(0);
      expect(groupRepo.save).toHaveBeenCalledTimes(1); // only from first call
    });

    it('counts errors and continues processing other groups', async () => {
      const failingGroup = makeGroup({ id: 'group-fail', memberships: [] });
      const goodMember = makeMember({ hasPaidCurrentRound: true });
      const goodGroup = makeGroup({ id: 'group-good', memberships: [goodMember] });

      groupRepo.find.mockResolvedValue([failingGroup, goodGroup]);
      // Make save throw for the first group
      groupRepo.save
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue(goodGroup);

      const result = await service.processDeadlinedGroups();

      expect(result.errors).toBe(1);
      expect(result.advanced).toBe(1);
    });

    it('respects ROUND_GRACE_PERIOD_HOURS from config', async () => {
      configService.get.mockImplementation((key: string, def?: any) => {
        if (key === 'ROUND_GRACE_PERIOD_HOURS') return 2;
        return def;
      });

      // updatedAt 90 min ago, roundDuration 1h → base deadline passed, but 2h grace not yet
      const member = makeMember({ hasPaidCurrentRound: true });
      const group = makeGroup({
        updatedAt: new Date(NOW.getTime() - 90 * 60 * 1000),
        memberships: [member],
      });
      groupRepo.find.mockResolvedValue([group]);

      const result = await service.processDeadlinedGroups();

      expect(result.advanced).toBe(0);
      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('ignores non-active memberships when checking payments', async () => {
      const activePaid = makeMember({ id: 'mem-1', userId: 'user-1', hasPaidCurrentRound: true, status: MembershipStatus.ACTIVE });
      const suspendedUnpaid = makeMember({ id: 'mem-2', userId: 'user-2', hasPaidCurrentRound: false, status: MembershipStatus.SUSPENDED });
      const group = makeGroup({ memberships: [activePaid, suspendedUnpaid] });
      groupRepo.find.mockResolvedValue([group]);

      const result = await service.processDeadlinedGroups();

      // Only active members count — group should advance
      expect(result.advanced).toBe(1);
    });
  });
});
