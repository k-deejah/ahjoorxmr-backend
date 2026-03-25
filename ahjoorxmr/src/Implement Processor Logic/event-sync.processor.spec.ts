import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import {
  EventSyncProcessor,
  JOBS,
  SyncOnChainEventPayload,
  TransferEventPayload,
  ApprovalEventPayload,
} from './event-sync.processor';
import { OnChainEvent } from '../entities/on-chain-event.entity';
import { ApprovalEvent } from '../entities/approval-event.entity';
import { ContributionsService } from '../contributions/contributions.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJob<T>(name: string, data: T): Job<T> {
  return { id: '1', name, data } as unknown as Job<T>;
}

function mockRepo<T>() {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('EventSyncProcessor', () => {
  let processor: EventSyncProcessor;
  let onChainEventRepo: jest.Mocked<Repository<OnChainEvent>>;
  let approvalEventRepo: jest.Mocked<Repository<ApprovalEvent>>;
  let contributionsService: jest.Mocked<ContributionsService>;

  beforeEach(async () => {
    onChainEventRepo = mockRepo<OnChainEvent>();
    approvalEventRepo = mockRepo<ApprovalEvent>();
    contributionsService = {
      recordContributionFromTransfer: jest.fn(),
    } as unknown as jest.Mocked<ContributionsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSyncProcessor,
        {
          provide: getRepositoryToken(OnChainEvent),
          useValue: onChainEventRepo,
        },
        {
          provide: getRepositoryToken(ApprovalEvent),
          useValue: approvalEventRepo,
        },
        { provide: ContributionsService, useValue: contributionsService },
      ],
    }).compile();

    processor = module.get<EventSyncProcessor>(EventSyncProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  // ── handleSyncOnChainEvent ─────────────────────────────────────────────────

  describe('handleSyncOnChainEvent', () => {
    const payload: SyncOnChainEventPayload = {
      eventName: 'Transfer',
      transactionHash: '0xabc',
      blockNumber: 100,
      contractAddress: '0xcontract',
      chainId: 1,
    };

    it('persists a new event and returns it', async () => {
      onChainEventRepo.findOne.mockResolvedValue(null);
      const created = {
        id: 'uuid-1',
        ...payload,
        processedAt: new Date(),
        createdAt: new Date(),
      } as OnChainEvent;
      onChainEventRepo.create.mockReturnValue(created);
      onChainEventRepo.save.mockResolvedValue(created);

      const job = makeJob<SyncOnChainEventPayload>(
        JOBS.SYNC_ON_CHAIN_EVENT,
        payload,
      );
      const result = await processor.handleSyncOnChainEvent(job);

      expect(onChainEventRepo.findOne).toHaveBeenCalledWith({
        where: {
          transactionHash: payload.transactionHash,
          chainId: payload.chainId,
        },
      });
      expect(onChainEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: payload.transactionHash }),
      );
      expect(onChainEventRepo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('returns existing event without re-persisting (idempotency)', async () => {
      const existing = { id: 'existing-id', ...payload } as OnChainEvent;
      onChainEventRepo.findOne.mockResolvedValue(existing);

      const job = makeJob<SyncOnChainEventPayload>(
        JOBS.SYNC_ON_CHAIN_EVENT,
        payload,
      );
      const result = await processor.handleSyncOnChainEvent(job);

      expect(onChainEventRepo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  // ── handleTransferEvent ───────────────────────────────────────────────────

  describe('handleTransferEvent', () => {
    const payload: TransferEventPayload = {
      from: '0xfrom',
      to: '0xto',
      amount: '1000',
      transactionHash: '0xdef',
      blockNumber: 200,
      contractAddress: '0xcontract',
      chainId: 1,
    };

    it('delegates to ContributionsService', async () => {
      contributionsService.recordContributionFromTransfer.mockResolvedValue(
        {} as any,
      );
      const job = makeJob<TransferEventPayload>(
        JOBS.PROCESS_TRANSFER_EVENT,
        payload,
      );

      await processor.handleTransferEvent(job);

      expect(
        contributionsService.recordContributionFromTransfer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          from: payload.from,
          transactionHash: payload.transactionHash,
        }),
      );
    });

    it('propagates errors from ContributionsService (job will retry)', async () => {
      contributionsService.recordContributionFromTransfer.mockRejectedValue(
        new Error('DB error'),
      );
      const job = makeJob<TransferEventPayload>(
        JOBS.PROCESS_TRANSFER_EVENT,
        payload,
      );

      await expect(processor.handleTransferEvent(job)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // ── handleApprovalEvent ───────────────────────────────────────────────────

  describe('handleApprovalEvent', () => {
    const payload: ApprovalEventPayload = {
      ownerAddress: '0xowner',
      spenderAddress: '0xspender',
      amount: '5000',
      transactionHash: '0xghi',
      blockNumber: 300,
      contractAddress: '0xcontract',
      chainId: 1,
    };

    it('persists a new approval event', async () => {
      approvalEventRepo.findOne.mockResolvedValue(null);
      const created = {
        id: 'appr-1',
        ...payload,
        createdAt: new Date(),
      } as ApprovalEvent;
      approvalEventRepo.create.mockReturnValue(created);
      approvalEventRepo.save.mockResolvedValue(created);

      const job = makeJob<ApprovalEventPayload>(
        JOBS.PROCESS_APPROVAL_EVENT,
        payload,
      );
      const result = await processor.handleApprovalEvent(job);

      expect(approvalEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: payload.transactionHash }),
      );
      expect(approvalEventRepo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('is idempotent – skips save if already persisted', async () => {
      const existing = { id: 'appr-existing', ...payload } as ApprovalEvent;
      approvalEventRepo.findOne.mockResolvedValue(existing);

      const job = makeJob<ApprovalEventPayload>(
        JOBS.PROCESS_APPROVAL_EVENT,
        payload,
      );
      const result = await processor.handleApprovalEvent(job);

      expect(approvalEventRepo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  // ── process dispatcher ────────────────────────────────────────────────────

  describe('process (dispatcher)', () => {
    it('throws on unknown job names', async () => {
      const job = makeJob('UNKNOWN_JOB', {});
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown job name: UNKNOWN_JOB',
      );
    });
  });
});
