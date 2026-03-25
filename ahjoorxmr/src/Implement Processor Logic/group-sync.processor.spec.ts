import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import {
  GroupSyncProcessor,
  GROUP_SYNC_JOBS,
  SyncGroupStatePayload,
} from './group-sync.processor';
import { Group } from '../entities/group.entity';
import { StellarService } from '../stellar/stellar.service';

function makeJob<T>(name: string, data: T): Job<T> {
  return { id: '1', name, data } as unknown as Job<T>;
}

describe('GroupSyncProcessor', () => {
  let processor: GroupSyncProcessor;
  let groupRepo: jest.Mocked<Repository<Group>>;
  let stellarService: jest.Mocked<StellarService>;

  beforeEach(async () => {
    groupRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Group>>;

    stellarService = {
      getGroupState: jest.fn(),
    } as unknown as jest.Mocked<StellarService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupSyncProcessor,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: StellarService, useValue: stellarService },
      ],
    }).compile();

    processor = module.get<GroupSyncProcessor>(GroupSyncProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  // ── SYNC_GROUP_STATE ──────────────────────────────────────────────────────

  describe('handleSyncGroupState', () => {
    const payload: SyncGroupStatePayload = {
      groupId: 'group-uuid-1',
      contractAddress: '0xcontract',
      chainId: 1,
    };

    it('updates group status and currentRound from on-chain state', async () => {
      const group: Group = {
        id: payload.groupId,
        name: 'Test Group',
        contractAddress: payload.contractAddress,
        chainId: payload.chainId,
        status: 'active',
        currentRound: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      groupRepo.findOne.mockResolvedValue(group);
      stellarService.getGroupState.mockResolvedValue({
        status: 'active',
        currentRound: 3,
      });

      const updatedGroup = { ...group, status: 'active', currentRound: 3 };
      groupRepo.save.mockResolvedValue(updatedGroup as Group);

      const job = makeJob<SyncGroupStatePayload>(
        GROUP_SYNC_JOBS.SYNC_GROUP_STATE,
        payload,
      );
      const result = await processor.handleSyncGroupState(job);

      expect(stellarService.getGroupState).toHaveBeenCalledWith(
        payload.contractAddress,
        payload.chainId,
      );
      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', currentRound: 3 }),
      );
      expect(result.currentRound).toBe(3);
    });

    it('throws if group is not found in DB', async () => {
      groupRepo.findOne.mockResolvedValue(null);

      const job = makeJob<SyncGroupStatePayload>(
        GROUP_SYNC_JOBS.SYNC_GROUP_STATE,
        payload,
      );
      await expect(processor.handleSyncGroupState(job)).rejects.toThrow(
        'Group not found',
      );
    });

    it('propagates StellarService errors so the job is retried', async () => {
      const group: Group = {
        id: payload.groupId,
        name: 'Test Group',
        contractAddress: null,
        chainId: null,
        status: 'active',
        currentRound: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      groupRepo.findOne.mockResolvedValue(group);
      stellarService.getGroupState.mockRejectedValue(new Error('RPC timeout'));

      const job = makeJob<SyncGroupStatePayload>(
        GROUP_SYNC_JOBS.SYNC_GROUP_STATE,
        payload,
      );
      await expect(processor.handleSyncGroupState(job)).rejects.toThrow(
        'RPC timeout',
      );
      expect(groupRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── dispatcher ───────────────────────────────────────────────────────────

  describe('process (dispatcher)', () => {
    it('throws on unknown job names', async () => {
      const job = makeJob('MYSTERY_JOB', {});
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown job name: MYSTERY_JOB',
      );
    });
  });
});
