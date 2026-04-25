import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarService } from './stellar.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { ContractStateGuard } from './contract-state-guard.service';
import { MetricsService } from '../metrics/metrics.service';
import { WinstonLogger } from '../common/logger/winston.logger';

describe('StellarService - Payout Balance Guard (Integration Tests)', () => {
  let service: StellarService;
  let configService: ConfigService;
  let circuitBreakerService: StellarCircuitBreakerService;
  let contractStateGuard: ContractStateGuard;
  let metricsService: MetricsService;
  let logger: WinstonLogger;

  const mockServer = {
    loadAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    sendTransaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        CONTRACT_ADDRESS: '',
        STELLAR_ISSUER_ACCOUNT:
          'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
        STELLAR_MIN_BALANCE_ALERT_XLM: 5,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockCircuitBreakerService = {
    execute: jest.fn(),
    isOpen: jest.fn(() => false),
  };

  const mockContractStateGuard = {
    validatePreconditions: jest.fn(),
  };

  const mockMetricsService = {
    incrementStellarTransaction: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock the Stellar SDK
    jest.mock('@stellar/stellar-sdk', () => ({
      Keypair: {
        random: () => ({
          publicKey: () => 'GPUBLIC123',
        }),
      },
      Account: function (publicKey: string, sequence: string) {
        this.publicKey = publicKey;
        this.sequence = sequence;
      },
      TransactionBuilder: function (sourceAccount: any, options: any) {
        this.sourceAccount = sourceAccount;
        this.operations = [];
        this.addOperation = (op: any) => {
          this.operations.push(op);
          return this;
        };
        this.setTimeout = (timeout: number) => this;
        this.build = () => ({
          toXDR: () => 'mocked_xdr',
        });
      },
      Contract: function (contractAddress: string) {
        this.contractAddress = contractAddress;
        this.call = jest.fn(() => ({}));
      },
      nativeToScVal: jest.fn((val: any) => val),
      Asset: {
        native: () => ({ type: 'native' }),
      },
      Networks: {
        PUBLIC: 'Public Global Stellar Network ; May 2015',
        TESTNET: 'Test SDF Network ; September 2015',
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: StellarCircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: ContractStateGuard,
          useValue: mockContractStateGuard,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: WinstonLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    configService = module.get<ConfigService>(ConfigService);
    circuitBreakerService = module.get<StellarCircuitBreakerService>(
      StellarCircuitBreakerService,
    );
    contractStateGuard = module.get<ContractStateGuard>(ContractStateGuard);
    metricsService = module.get<MetricsService>(MetricsService);
    logger = module.get<WinstonLogger>(WinstonLogger);

    // Replace the server with our mock
    (service as any).server = mockServer;
  });

  describe('Payout balance guard', () => {
    it('should block payout when issuer balance is insufficient (below threshold)', async () => {
      // Setup: Low balance account
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '2.5000000', // Below 5 XLM threshold
          },
        ],
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      try {
        await service.disbursePayout(contractAddress, recipientWallet, amount);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(409);

        const response = httpError.getResponse() as any;
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('Conflict');
        expect(response.data.error).toBe('Insufficient issuer balance');
        expect(response.data.currentBalance).toBe('2.5000000');
        expect(response.data.minimumRequired).toBe('5');
      }
    });

    it('should allow payout when issuer balance is sufficient', async () => {
      // Setup: Sufficient balance account
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '10.0000000', // Above 5 XLM threshold
          },
        ],
      });

      mockContractStateGuard.validatePreconditions.mockResolvedValue(undefined);
      mockServer.prepareTransaction.mockResolvedValue({
        toXDR: () => 'mocked_xdr',
        hash: () => ({
          toString: () => 'TXHASH123',
        }),
      });
      mockServer.sendTransaction.mockResolvedValue({
        hash: 'TXHASH123',
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      const result = await service.disbursePayout(
        contractAddress,
        recipientWallet,
        amount,
      );

      expect(result).toBeDefined();
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Payout blocked'),
      );
    });

    it('should return correct error structure with 409 status', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '1.5000000', // Very low
          },
        ],
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      try {
        await service.disbursePayout(contractAddress, recipientWallet, amount);
        fail('Should have thrown HttpException');
      } catch (error) {
        if (error instanceof HttpException) {
          const response = error.getResponse() as any;

          // Verify error structure
          expect(response).toHaveProperty('statusCode', 409);
          expect(response).toHaveProperty('error', 'Conflict');
          expect(response).toHaveProperty('message');
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('error');
          expect(response.data).toHaveProperty('currentBalance');
          expect(response.data).toHaveProperty('minimumRequired');

          // Verify values
          expect(response.data.currentBalance).toBe('1.5000000');
          expect(response.data.minimumRequired).toBe('5');
        }
      }
    });

    it('should log warning when blocking payout due to insufficient balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '2.0000000',
          },
        ],
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      try {
        await service.disbursePayout(contractAddress, recipientWallet, amount);
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Payout blocked'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient issuer balance'),
      );
    });

    it('should use custom minimum balance from config', async () => {
      const customMinimum = 10;
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            STELLAR_ISSUER_ACCOUNT:
              'GISSUER123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCD',
            STELLAR_MIN_BALANCE_ALERT_XLM: customMinimum,
            STELLAR_NETWORK: 'testnet',
          };
          return config[key] ?? defaultValue;
        },
      );

      // Balance is 7, which is above default 5 but below custom 10
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '7.0000000',
          },
        ],
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      try {
        await service.disbursePayout(contractAddress, recipientWallet, amount);
        fail('Should have thrown HttpException');
      } catch (error) {
        if (error instanceof HttpException) {
          const response = error.getResponse() as any;
          expect(response.data.minimumRequired).toBe('10');
        }
      }
    });

    it('should proceed with payout when balance check RPC fails (non-409 error)', async () => {
      // Setup: RPC error for balance check
      mockServer.loadAccount.mockRejectedValue(new Error('RPC timeout'));

      mockContractStateGuard.validatePreconditions.mockResolvedValue(undefined);
      mockServer.prepareTransaction.mockResolvedValue({
        toXDR: () => 'mocked_xdr',
        hash: () => ({
          toString: () => 'TXHASH123',
        }),
      });
      mockServer.sendTransaction.mockResolvedValue({
        hash: 'TXHASH123',
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      // Mock loadAccount to fail first time (balance check) but succeed later (not called again)
      let callCount = 0;
      mockServer.loadAccount.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('RPC timeout');
        }
        return {
          balances: [{ asset_type: 'native', balance: '10.0000000' }],
        };
      });

      const result = await service.disbursePayout(
        contractAddress,
        recipientWallet,
        amount,
      );

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check issuer balance'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Proceeding with payout'),
      );
    });

    it('should block payout when issuer account is exactly at zero balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '0.0000000',
          },
        ],
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      try {
        await service.disbursePayout(contractAddress, recipientWallet, amount);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(409);
      }
    });

    it('should handle payout when issuer account has multiple asset balances', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '10.0000000', // Native XLM is sufficient
          },
          {
            asset_type: 'credit_alphanum12',
            asset_code: 'USDC',
            asset_issuer: 'GUSDC123',
            balance: '0.0000000', // But USDC balance is 0
          },
        ],
      });

      mockContractStateGuard.validatePreconditions.mockResolvedValue(undefined);
      mockServer.prepareTransaction.mockResolvedValue({
        toXDR: () => 'mocked_xdr',
        hash: () => ({
          toString: () => 'TXHASH123',
        }),
      });
      mockServer.sendTransaction.mockResolvedValue({
        hash: 'TXHASH123',
      });

      const contractAddress = 'CCONTRACT123';
      const recipientWallet = 'GRECIPIENT123';
      const amount = '100';

      const result = await service.disbursePayout(
        contractAddress,
        recipientWallet,
        amount,
      );

      expect(result).toBeDefined();
      // Should succeed because native XLM balance is sufficient
    });
  });

  describe('Balance check method', () => {
    it('should correctly identify sufficient balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '20.5000000',
          },
        ],
      });

      const result = await service.checkAccountBalance('GACCOUNT123', 10);

      expect(result.currentBalance).toBe('20.5000000');
      expect(result.isSufficient).toBe(true);
    });

    it('should correctly identify insufficient balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '3.5000000',
          },
        ],
      });

      const result = await service.checkAccountBalance('GACCOUNT123', 10);

      expect(result.currentBalance).toBe('3.5000000');
      expect(result.isSufficient).toBe(false);
    });

    it('should use default minimum of 5 XLM if not specified', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '4.5000000',
          },
        ],
      });

      const result = await service.checkAccountBalance('GACCOUNT123');

      expect(result.isSufficient).toBe(false); // 4.5 < 5
    });
  });

  describe('Native balance retrieval', () => {
    it('should extract native XLM balance from account', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'native',
            balance: '123.4567890',
          },
        ],
      });

      const balance = await service.getNativeBalance('GACCOUNT123');

      expect(balance).toBe('123.4567890');
    });

    it('should return zero if no native balance found', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'credit_alphanum12',
            asset_code: 'USDC',
            balance: '100.0000000',
          },
        ],
      });

      const balance = await service.getNativeBalance('GACCOUNT123');

      expect(balance).toBe('0');
    });
  });
});
