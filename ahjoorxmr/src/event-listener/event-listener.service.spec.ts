import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { EventListenerService } from './event-listener.service';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Group } from '../groups/entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockContributionRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockMembershipRepository = {
  update: jest.fn(),
};

const mockGroupRepository = {
  increment: jest.fn(),
};

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const values: Record<string, string> = {
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      CONTRACT_ADDRESS: 'CABCDEFG',
      EVENT_POLL_INTERVAL_MS: '15000',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      REDIS_DB: '0',
    };
    return values[key] ?? defaultValue;
  }),
};

describe('EventListenerService', () => {
  let service: EventListenerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedis.get.mockResolvedValue('10');
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key.startsWith('event-listener:processed-tx:')) {
        return null;
      }
      return '10';
    });
    mockContributionRepository.findOne.mockResolvedValue(null);
    mockContributionRepository.create.mockImplementation(
      (value: unknown) => value,
    );
    mockContributionRepository.save.mockResolvedValue({
      id: 'new-contribution',
    });
    mockContributionRepository.update.mockResolvedValue(undefined);
    mockMembershipRepository.update.mockResolvedValue(undefined);
    mockGroupRepository.increment.mockResolvedValue(undefined);
    (global as any).fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventListenerService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRedisConnectionToken('default'), useValue: mockRedis },
        {
          provide: getRepositoryToken(Contribution),
          useValue: mockContributionRepository,
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: mockMembershipRepository,
        },
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        { provide: WinstonLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<EventListenerService>(EventListenerService);
  });

  it('processes ContributionReceived events and updates contribution + membership', async () => {
    const topicScVal = { topic: 'ContributionReceived' };
    const dataScVal = { data: 'payload' };
    const contractEvent = {
      body: () => ({
        v0: () => ({
          topics: () => [topicScVal],
          data: () => dataScVal,
        }),
      }),
    };
    const txMeta = {
      switch: () => 4,
      v4: () => ({
        diagnosticEvents: () => [{ event: () => contractEvent }],
      }),
    };

    const fromXdrSpy = jest
      .spyOn((StellarSdk as any).xdr.TransactionMeta, 'fromXDR')
      .mockReturnValue(txMeta);
    const scValSpy = jest
      .spyOn(service as any, 'scValToNative')
      .mockImplementation((value: unknown) => {
        if (value === topicScVal) return 'ContributionReceived';
        if (value === dataScVal) {
          return {
            groupId: 'group-1',
            userId: 'user-1',
            walletAddress: 'GABC123',
            amount: '5000000',
            roundNumber: 3,
          };
        }
        return value;
      });

    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              hash: 'tx-hash-1',
              successful: true,
              ledger: 11,
              created_at: '2026-01-01T00:00:00Z',
              result_meta_xdr: 'AAAA',
            },
          ],
        },
      }),
    });

    await service.pollNow();

    expect(mockContributionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-1',
        transactionHash: 'tx-hash-1',
        amount: '5000000',
      }),
    );
    expect(mockContributionRepository.save).toHaveBeenCalledTimes(1);
    expect(mockMembershipRepository.update).toHaveBeenCalledWith(
      { groupId: 'group-1', userId: 'user-1' },
      { hasPaidCurrentRound: true },
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'event-listener:last-processed-ledger:CABCDEFG',
      '11',
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'event-listener:processed-tx:tx-hash-1',
      '1',
    );

    fromXdrSpy.mockRestore();
    scValSpy.mockRestore();
  });

  it('processes RoundCompleted events and updates group/membership round flags', async () => {
    const topicScVal = { topic: 'RoundCompleted' };
    const dataScVal = { data: 'payload' };
    const contractEvent = {
      body: () => ({
        v0: () => ({
          topics: () => [topicScVal],
          data: () => dataScVal,
        }),
      }),
    };
    const txMeta = {
      switch: () => 4,
      v4: () => ({
        diagnosticEvents: () => [{ event: () => contractEvent }],
      }),
    };

    const fromXdrSpy = jest
      .spyOn((StellarSdk as any).xdr.TransactionMeta, 'fromXDR')
      .mockReturnValue(txMeta);
    const scValSpy = jest
      .spyOn(service as any, 'scValToNative')
      .mockImplementation((value: unknown) => {
        if (value === topicScVal) return 'RoundCompleted';
        if (value === dataScVal) {
          return {
            groupId: 'group-1',
            payoutRecipientUserId: 'user-9',
          };
        }
        return value;
      });

    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              hash: 'tx-hash-2',
              successful: true,
              ledger: 12,
              result_meta_xdr: 'BBBB',
            },
          ],
        },
      }),
    });

    await service.pollNow();

    expect(mockGroupRepository.increment).toHaveBeenCalledWith(
      { id: 'group-1' },
      'currentRound',
      1,
    );
    expect(mockMembershipRepository.update).toHaveBeenCalledWith(
      { groupId: 'group-1' },
      { hasPaidCurrentRound: false },
    );
    expect(mockMembershipRepository.update).toHaveBeenCalledWith(
      { groupId: 'group-1', userId: 'user-9' },
      { hasReceivedPayout: true },
    );

    fromXdrSpy.mockRestore();
    scValSpy.mockRestore();
  });

  it('supports start and stop controls for polling', () => {
    service.stopPolling();
    expect(service.getPollingStatus().running).toBe(false);

    service.startPolling();
    expect(service.getPollingStatus().running).toBe(true);
    expect(service.getPollingStatus().pollIntervalMs).toBe(15000);
  });

  it('logs processing errors without crashing polling', async () => {
    const topicScVal = { topic: 'ContributionReceived' };
    const dataScVal = { data: 'payload' };
    const contractEvent = {
      body: () => ({
        v0: () => ({
          topics: () => [topicScVal],
          data: () => dataScVal,
        }),
      }),
    };
    const txMeta = {
      switch: () => 4,
      v4: () => ({
        diagnosticEvents: () => [{ event: () => contractEvent }],
      }),
    };

    const fromXdrSpy = jest
      .spyOn((StellarSdk as any).xdr.TransactionMeta, 'fromXDR')
      .mockReturnValue(txMeta);
    const scValSpy = jest
      .spyOn(service as any, 'scValToNative')
      .mockImplementation((value: unknown) => {
        if (value === topicScVal) return 'ContributionReceived';
        if (value === dataScVal) {
          return {
            groupId: 'group-1',
            userId: 'user-1',
            walletAddress: 'GABC123',
            amount: '5000000',
            roundNumber: 3,
          };
        }
        return value;
      });

    mockContributionRepository.save.mockRejectedValue(
      new Error('database temporarily unavailable'),
    );

    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              hash: 'tx-hash-3',
              successful: true,
              ledger: 13,
              result_meta_xdr: 'CCCC',
            },
          ],
        },
      }),
    });

    await expect(service.pollNow()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'event-listener:last-processed-ledger:CABCDEFG',
      '13',
    );

    fromXdrSpy.mockRestore();
    scValSpy.mockRestore();
  });

  it('falls back to account transactions endpoint when contract endpoint is unavailable', async () => {
    (global as any).fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: { records: [] },
        }),
      });

    await expect(service.pollNow()).resolves.toBeUndefined();
    expect((global as any).fetch).toHaveBeenCalledTimes(2);
  });
});
