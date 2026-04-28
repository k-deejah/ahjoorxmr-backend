import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WaitlistService } from '../waitlist.service';
import { GroupWaitlist, WaitlistStatus } from '../entities/group-waitlist.entity';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { NotificationsService } from '../../notification/notifications.service';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { NotificationType } from '../../notification/notification-type.enum';

const GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADMIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockGroup = (overrides: Partial<Group> = {}): Group =>
  ({
    id: GROUP_ID,
    name: 'Test Group',
    maxMembers: 3,
    adminWallet: 'GADMIN',
    ...overrides,
  } as Group);

const mockEntry = (overrides: Partial<GroupWaitlist> = {}): GroupWaitlist =>
  ({
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    groupId: GROUP_ID,
    userId: USER_ID,
    position: 1,
    status: WaitlistStatus.WAITING,
    joinedWaitlistAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as GroupWaitlist);

const mockMembership = (overrides: Partial<Membership> = {}): Membership =>
  ({
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    groupId: GROUP_ID,
    userId: ADMIN_ID,
    walletAddress: 'GADMIN',
    payoutOrder: 0,
    status: MembershipStatus.ACTIVE,
    hasReceivedPayout: false,
    hasPaidCurrentRound: false,
    transactionHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Membership);

describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistRepo: Record<string, jest.Mock>;
  let groupRepo: Record<string, jest.Mock>;
  let membershipRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let notificationsService: { notify: jest.Mock };

  beforeEach(async () => {
    waitlistRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    groupRepo = { findOne: jest.fn() };
    membershipRepo = { findOne: jest.fn(), count: jest.fn() };
    notificationsService = { notify: jest.fn().mockResolvedValue(null) };

    // Default transaction mock: executes the callback with a manager that mirrors repos
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn(),
          count: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
          createQueryBuilder: jest.fn(),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: getRepositoryToken(GroupWaitlist), useValue: waitlistRepo },
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: WinstonLogger, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(50) } },
      ],
    }).compile();

    service = module.get(WaitlistService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── joinWaitlist ──────────────────────────────────────────────────────────

  describe('joinWaitlist', () => {
    it('returns position when group is full and user is new', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      membershipRepo.findOne.mockResolvedValue(null);
      waitlistRepo.findOne.mockResolvedValue(null);
      membershipRepo.count.mockResolvedValue(3); // at cap
      waitlistRepo.count.mockResolvedValue(2);
      waitlistRepo.create.mockReturnValue(mockEntry({ position: 3 }));
      waitlistRepo.save.mockResolvedValue(mockEntry({ position: 3 }));

      const result = await service.joinWaitlist(GROUP_ID, USER_ID);
      expect(result.position).toBe(3);
    });

    it('throws ConflictException when user is already a member', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      membershipRepo.findOne.mockResolvedValue(mockMembership({ userId: USER_ID }));

      await expect(service.joinWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user is already on the waitlist', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      membershipRepo.findOne.mockResolvedValue(null);
      waitlistRepo.findOne.mockResolvedValue(mockEntry());

      await expect(service.joinWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when group is not full', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup({ maxMembers: 5 }));
      membershipRepo.findOne.mockResolvedValue(null);
      waitlistRepo.findOne.mockResolvedValue(null);
      membershipRepo.count.mockResolvedValue(3); // below cap

      await expect(service.joinWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when waitlist cap is reached', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      membershipRepo.findOne.mockResolvedValue(null);
      waitlistRepo.findOne.mockResolvedValue(null);
      membershipRepo.count.mockResolvedValue(3); // at cap
      waitlistRepo.count.mockResolvedValue(50);  // waitlist full

      await expect(service.joinWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(
        'Waitlist is full (max 50 users)',
      );
    });

    it('throws NotFoundException when group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.joinWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── leaveWaitlist ─────────────────────────────────────────────────────────

  describe('leaveWaitlist', () => {
    it('cancels entry and re-sequences positions behind it', async () => {
      const entry = mockEntry({ position: 2 });
      waitlistRepo.findOne.mockResolvedValue(entry);
      waitlistRepo.save.mockResolvedValue({ ...entry, status: WaitlistStatus.CANCELLED });

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      waitlistRepo.createQueryBuilder.mockReturnValue(qb);

      await service.leaveWaitlist(GROUP_ID, USER_ID);

      expect(waitlistRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.CANCELLED }),
      );
      expect(qb.execute).toHaveBeenCalled();
    });

    it('throws NotFoundException when entry does not exist', async () => {
      waitlistRepo.findOne.mockResolvedValue(null);
      await expect(service.leaveWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getWaitlist ───────────────────────────────────────────────────────────

  describe('getWaitlist', () => {
    it('returns ordered waitlist for group admin', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup({ adminWallet: 'GADMIN' }));
      membershipRepo.findOne.mockResolvedValue(mockMembership({ userId: ADMIN_ID, walletAddress: 'GADMIN' }));
      const entries = [mockEntry({ position: 1 }), mockEntry({ position: 2, userId: 'other' })];
      waitlistRepo.find.mockResolvedValue(entries);

      const result = await service.getWaitlist(GROUP_ID, ADMIN_ID);
      expect(result).toHaveLength(2);
    });

    it('throws ForbiddenException for non-admin member', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup({ adminWallet: 'GADMIN' }));
      membershipRepo.findOne.mockResolvedValue(mockMembership({ walletAddress: 'GOTHER' }));

      await expect(service.getWaitlist(GROUP_ID, ADMIN_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for non-member', async () => {
      groupRepo.findOne.mockResolvedValue(mockGroup());
      membershipRepo.findOne.mockResolvedValue(null);

      await expect(service.getWaitlist(GROUP_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── admitNextFromWaitlist ─────────────────────────────────────────────────

  describe('admitNextFromWaitlist', () => {
    it('admits first WAITING user, creates membership, marks ADMITTED, sends notification', async () => {
      const entry = mockEntry({ position: 1 });
      const group = mockGroup();

      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(entry)   // GroupWaitlist
          .mockResolvedValueOnce(group),  // Group
        count: jest.fn().mockResolvedValue(2), // below maxMembers
        create: jest.fn().mockReturnValue(mockMembership({ userId: USER_ID })),
        save: jest.fn().mockResolvedValue({}),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ maxOrder: 1 }),
        }),
      };
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await service.admitNextFromWaitlist(GROUP_ID);

      expect(manager.save).toHaveBeenCalledWith(
        Membership,
        expect.objectContaining({ userId: USER_ID, status: MembershipStatus.ACTIVE }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        GroupWaitlist,
        expect.objectContaining({ status: WaitlistStatus.ADMITTED }),
      );
    });

    it('does nothing when no WAITING entry exists', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await service.admitNextFromWaitlist(GROUP_ID);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('does nothing when group is still at capacity after removal race', async () => {
      const entry = mockEntry();
      const group = mockGroup({ maxMembers: 3 });

      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(entry)
          .mockResolvedValueOnce(group),
        count: jest.fn().mockResolvedValue(3), // still full
        create: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await service.admitNextFromWaitlist(GROUP_ID);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('sends WAITLIST_ADMITTED notification after admission', async () => {
      jest.useFakeTimers();
      const entry = mockEntry({ position: 1 });
      const group = mockGroup();

      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(entry)
          .mockResolvedValueOnce(group),
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockReturnValue(mockMembership({ userId: USER_ID })),
        save: jest.fn().mockResolvedValue({}),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ maxOrder: null }),
        }),
      };
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await service.admitNextFromWaitlist(GROUP_ID);
      jest.runAllImmediates();

      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          type: NotificationType.WAITLIST_ADMITTED,
        }),
      );
      jest.useRealTimers();
    });
  });
});
