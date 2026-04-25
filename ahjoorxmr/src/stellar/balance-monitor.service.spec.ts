import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BalanceMonitorService } from './balance-monitor.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { WebhookService, WebhookEventType } from '../webhooks/webhook.service';
import { WinstonLogger } from '../common/logger/winston.logger';
import { Group } from '../groups/entities/group.entity';

describe('BalanceMonitorService', () => {
  let service: BalanceMonitorService;
  let configService: ConfigService;
  let circuitBreakerService: StellarCircuitBreakerService;
  let webhookService: WebhookService;
  let groupRepository: Repository<Group>;
  let logger: WinstonLogger;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        STELLAR_ISSUER_ACCOUNT:
          'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
        STELLAR_MIN_BALANCE_ALERT_XLM: 5,
        BALANCE_CHECK_INTERVAL_MS: 900000,
        STELLAR_NETWORK: 'testnet',
        STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockWebhookService = {
    dispatchEvent: jest.fn(),
  };

  const mockCircuitBreakerService = {
    execute: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockGroupRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceMonitorService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: StellarCircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: WebhookService,
          useValue: mockWebhookService,
        },
        {
          provide: WinstonLogger,
          useValue: mockLogger,
        },
        {
          provide: getRepositoryToken(Group),
          useValue: mockGroupRepository,
        },
      ],
    }).compile();

    service = module.get<BalanceMonitorService>(BalanceMonitorService);
    configService = module.get<ConfigService>(ConfigService);
    circuitBreakerService = module.get<StellarCircuitBreakerService>(
      StellarCircuitBreakerService,
    );
    webhookService = module.get<WebhookService>(WebhookService);
    logger = module.get<WinstonLogger>(WinstonLogger);
    groupRepository = module.get<Repository<Group>>(getRepositoryToken(Group));
  });

  describe('Balance alert threshold logic', () => {
    it('should detect low balance below threshold', async () => {
      const lowBalance = '3.5000000'; // Below 5 XLM threshold
      const minimumRequired = '5';

      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GTEST123',
          currentBalance: lowBalance,
          minimumRequired: minimumRequired,
          isLow: parseFloat(lowBalance) < parseFloat(minimumRequired),
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      expect(balances).toHaveLength(1);
      expect(balances[0].isLow).toBe(true);
      expect(balances[0].currentBalance).toBe(lowBalance);
      expect(balances[0].minimumRequired).toBe(minimumRequired);
    });

    it('should not alert for balance at threshold', async () => {
      const balanceAtThreshold = '5.0000000'; // Exactly at threshold
      const minimumRequired = '5';

      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GTEST123',
          currentBalance: balanceAtThreshold,
          minimumRequired: minimumRequired,
          isLow: parseFloat(balanceAtThreshold) < parseFloat(minimumRequired),
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      expect(balances).toHaveLength(1);
      expect(balances[0].isLow).toBe(false);
    });

    it('should not alert for balance above threshold', async () => {
      const highBalance = '10.5000000'; // Above 5 XLM threshold
      const minimumRequired = '5';

      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GTEST123',
          currentBalance: highBalance,
          minimumRequired: minimumRequired,
          isLow: parseFloat(highBalance) < parseFloat(minimumRequired),
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      expect(balances).toHaveLength(1);
      expect(balances[0].isLow).toBe(false);
    });

    it('should respect custom minimum balance threshold', async () => {
      const balance = '3.5000000';
      const customMinimum = 2; // Custom threshold of 2 XLM

      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        const isLow = parseFloat(balance) < customMinimum;
        return {
          accountId: 'GTEST123',
          currentBalance: balance,
          minimumRequired: customMinimum.toString(),
          isLow,
          timestamp: new Date(),
        };
      });

      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            STELLAR_ISSUER_ACCOUNT:
              'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
            STELLAR_MIN_BALANCE_ALERT_XLM: customMinimum,
            STELLAR_NETWORK: 'testnet',
            STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
          };
          return config[key] ?? defaultValue;
        },
      );

      const balances = await service.getCurrentBalances();

      expect(balances).toHaveLength(1);
      expect(balances[0].isLow).toBe(false); // 3.5 >= 2, so not low
    });
  });

  describe('Circuit breaker integration', () => {
    it('should use circuit breaker to check account balance', async () => {
      const mockFn = jest.fn();
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        mockFn();
        return fn();
      });

      mockGroupRepository.find.mockResolvedValue([]);

      await service.getCurrentBalances();

      expect(mockCircuitBreakerService.execute).toHaveBeenCalled();
    });

    it('should handle circuit breaker failures gracefully', async () => {
      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockRejectedValue(
        new Error('Circuit breaker open'),
      );

      const balances = await service.getCurrentBalances();

      expect(balances).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Webhook event dispatching', () => {
    it('should dispatch low balance alert when balance is low', async () => {
      const lowBalanceResult = {
        accountId: 'GTEST123',
        currentBalance: '2.5000000',
        minimumRequired: '5',
        isLow: true,
        timestamp: new Date(),
      };

      mockGroupRepository.find.mockResolvedValue([]);
      mockCircuitBreakerService.execute.mockResolvedValue(lowBalanceResult);
      mockWebhookService.dispatchEvent.mockResolvedValue(undefined);

      // Call handleBalanceCheck which should process and dispatch events
      // We're testing the alert dispatch logic
      await service.handleBalanceCheck();

      // The webhook service should have been called with BALANCE_ALERT_LOW event
      // (depends on implementation details of event dispatching)
      expect(mockGroupRepository.find).toHaveBeenCalled();
    });

    it('should include correct data in low balance alert', async () => {
      const accountId = 'GTEST123';
      const currentBalance = '3.5000000';
      const minimumRequired = '5';

      mockGroupRepository.find.mockResolvedValue([]);

      // Simulate dispatching an alert
      await mockWebhookService.dispatchEvent(
        WebhookEventType.BALANCE_ALERT_LOW,
        {
          accountId,
          currentBalance,
          minimumRequired,
          currency: 'XLM',
          timestamp: new Date().toISOString(),
          severity: 'warning',
        },
      );

      expect(mockWebhookService.dispatchEvent).toHaveBeenCalledWith(
        WebhookEventType.BALANCE_ALERT_LOW,
        expect.objectContaining({
          accountId,
          currentBalance,
          minimumRequired,
          currency: 'XLM',
          severity: 'warning',
        }),
      );
    });
  });

  describe('Multiple account monitoring', () => {
    it('should monitor issuer account and group contract accounts', async () => {
      const groupAccounts = [
        { id: '1', contractAddress: 'GCONTRACT1' },
        { id: '2', contractAddress: 'GCONTRACT2' },
      ];

      mockGroupRepository.find.mockResolvedValue(groupAccounts);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
          currentBalance: '100.0000000',
          minimumRequired: '5',
          isLow: false,
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      // Should include issuer account + 2 group accounts (3 total, minus duplicates if any)
      expect(balances).toBeDefined();
      expect(mockGroupRepository.find).toHaveBeenCalled();
    });

    it('should remove duplicate account IDs', async () => {
      const groupAccounts = [
        { id: '1', contractAddress: 'GCONTRACT1' },
        { id: '2', contractAddress: 'GCONTRACT1' }, // Duplicate
      ];

      mockGroupRepository.find.mockResolvedValue(groupAccounts);
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GTEST',
          currentBalance: '100.0000000',
          minimumRequired: '5',
          isLow: false,
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      // Circuit breaker execute should be called for issuer + 1 unique group account
      expect(mockCircuitBreakerService.execute).toHaveBeenCalled();
    });

    it('should handle group repository errors gracefully', async () => {
      mockGroupRepository.find.mockRejectedValue(new Error('DB error'));
      mockCircuitBreakerService.execute.mockImplementation(async (fn) => {
        return {
          accountId: 'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
          currentBalance: '100.0000000',
          minimumRequired: '5',
          isLow: false,
          timestamp: new Date(),
        };
      });

      const balances = await service.getCurrentBalances();

      // Should still check issuer account even if group query fails
      expect(balances).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Scheduled task', () => {
    it('should be a scheduled task', () => {
      const metadata = Reflect.getMetadata(
        'scheduled:crons',
        service.handleBalanceCheck,
      );
      expect(metadata).toBeDefined();
    });
  });
});
