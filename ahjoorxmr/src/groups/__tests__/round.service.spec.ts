import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoundService } from '../round.service';
import { Group } from '../entities/group.entity';
import { GroupStatus } from '../entities/group-status.enum';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { NotificationsService } from '../../notification/notifications.service';
import { NotificationType } from '../../notification/notification-type.enum';
import { PayoutService } from '../payout.service';

const GROUP_ID = 'group-uuid';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    name: 'Test ROSCA',
    status: GroupStatus.ACTIVE,
    currentRound: 1,
    totalRounds: 3,
    roundDuration: 30,
    staleAt: null,
    ...overrides,
  } as Group;
}

function makeMembership(userId: string, hasPaid: boolean): Membership {
  return {
    id: `mem-${userId}`,
    groupId: GROUP_ID,
    userId,
    status: MembershipStatus.ACTIVE,
    hasPaidCurrentRound: hasPaid,
  } as Membership;
}

describe('RoundService', () => {
  let service: RoundService;
  let groupRepo: { findOne: jest.Mock; save: jest.Mock };
  let membershipRepo: { find: jest.Mock; update: jest.Mock };
  let notificationsService: { notifyBatch: jest.Mock };
  let payoutService: { distributePayout: jest.Mock };

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn(), save: jest.fn() };
    membershipRepo = { find: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    notificationsService = { notifyBatch: jest.fn().mockResolvedValue([]) };
    payoutService = { distributePayout: jest.fn().mockResolvedValue('TX_HASH') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoundService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: PayoutService, useValue: payoutService },
      ],
    }).compile();

    service = module.get(RoundService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Partial contribution — must NOT advance ────────────────────────────────

  it('does NOT advance when some members have not paid', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.find.mockResolvedValue([
      makeMembership('u1', true),
      makeMembership('u2', false), // not paid
    ]);

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(false);
    expect(groupRepo.save).not.toHaveBeenCalled();
    expect(membershipRepo.update).not.toHaveBeenCalled();
  });

  // ── All paid — must advance ────────────────────────────────────────────────

  it('advances round when all members have paid', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ currentRound: 1, totalRounds: 3 }));
    membershipRepo.find.mockResolvedValue([
      makeMembership('u1', true),
      makeMembership('u2', true),
    ]);
    groupRepo.save.mockResolvedValue({});

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(true);
    expect(membershipRepo.update).toHaveBeenCalledWith(
      { groupId: GROUP_ID, status: MembershipStatus.ACTIVE },
      { hasPaidCurrentRound: false },
    );
    expect(groupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentRound: 2, status: GroupStatus.ACTIVE }),
    );
    expect(payoutService.distributePayout).toHaveBeenCalledWith(GROUP_ID, 1);
  });

  // ── ROUND_OPENED notification sent to all members ─────────────────────────

  it('sends ROUND_OPENED notifications to all members on advance', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ currentRound: 1, totalRounds: 3 }));
    membershipRepo.find.mockResolvedValue([
      makeMembership('u1', true),
      makeMembership('u2', true),
    ]);
    groupRepo.save.mockResolvedValue({});

    await service.tryAdvanceRound(GROUP_ID);

    // Allow the fire-and-forget promise to settle
    await new Promise(setImmediate);

    expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', type: NotificationType.ROUND_OPENED }),
        expect.objectContaining({ userId: 'u2', type: NotificationType.ROUND_OPENED }),
      ]),
    );
  });

  // ── Final round — must transition to COMPLETED ────────────────────────────

  it('transitions group to COMPLETED when final round is completed', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ currentRound: 3, totalRounds: 3 }));
    membershipRepo.find.mockResolvedValue([
      makeMembership('u1', true),
      makeMembership('u2', true),
    ]);
    groupRepo.save.mockResolvedValue({});

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(true);
    expect(groupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: GroupStatus.COMPLETED }),
    );
    expect(payoutService.distributePayout).toHaveBeenCalledWith(GROUP_ID, 3);
    // No payment reset or notifications on completion
    expect(membershipRepo.update).not.toHaveBeenCalled();
  });

  // ── No-op for non-ACTIVE groups ───────────────────────────────────────────

  it('returns false and does nothing for a PENDING group', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ status: GroupStatus.PENDING }));

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(false);
    expect(membershipRepo.find).not.toHaveBeenCalled();
    expect(groupRepo.save).not.toHaveBeenCalled();
  });

  it('returns false and does nothing for a COMPLETED group', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ status: GroupStatus.COMPLETED }));

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(false);
    expect(groupRepo.save).not.toHaveBeenCalled();
  });

  it('returns false when group is not found', async () => {
    groupRepo.findOne.mockResolvedValue(null);

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(false);
  });

  // ── Edge: single member group ─────────────────────────────────────────────

  it('advances correctly for a single-member group', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ currentRound: 1, totalRounds: 2 }));
    membershipRepo.find.mockResolvedValue([makeMembership('u1', true)]);
    groupRepo.save.mockResolvedValue({});

    const result = await service.tryAdvanceRound(GROUP_ID);

    expect(result).toBe(true);
    expect(groupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentRound: 2, status: GroupStatus.ACTIVE }),
    );
  });

  // ── Idempotency key format ────────────────────────────────────────────────

  it('uses correct idempotency key format in notifications', async () => {
    groupRepo.findOne.mockResolvedValue(makeGroup({ currentRound: 1, totalRounds: 3 }));
    membershipRepo.find.mockResolvedValue([makeMembership('u1', true)]);
    groupRepo.save.mockResolvedValue({});

    await service.tryAdvanceRound(GROUP_ID);
    await new Promise(setImmediate);

    expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: `${GROUP_ID}-2-u1-ROUND_OPENED`,
        }),
      ]),
    );
  });

  // ── staleAt is cleared on advance ────────────────────────────────────────

  it('clears staleAt when advancing a round', async () => {
    groupRepo.findOne.mockResolvedValue(
      makeGroup({ currentRound: 1, totalRounds: 3, staleAt: new Date() }),
    );
    membershipRepo.find.mockResolvedValue([makeMembership('u1', true)]);
    groupRepo.save.mockResolvedValue({});

    await service.tryAdvanceRound(GROUP_ID);

    expect(groupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ staleAt: null }),
    );
  });
});
