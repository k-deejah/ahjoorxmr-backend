import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StellarService } from './stellar.service';

const mockServer = {
  prepareTransaction: jest.fn(),
  simulateTransaction: jest.fn(),
  getTransaction: jest.fn(),
};

jest.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: jest.fn(() => mockServer),
}));

describe('StellarService', () => {
  let service: StellarService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        STELLAR_NETWORK_PASSPHRASE: (StellarSdk as any).Networks.TESTNET,
        CONTRACT_ADDRESS:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      };
      return values[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockServer.prepareTransaction.mockResolvedValue({ prepared: true });
    mockServer.simulateTransaction.mockResolvedValue({
      result: { retval: { id: 'group-1' } },
    });
    mockServer.getTransaction.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should create Soroban RPC server from env config', () => {
    expect((SorobanRpc as any).Server).toHaveBeenCalledWith(
      'https://soroban-testnet.stellar.org',
      { allowHttp: false },
    );
  });

  describe('getGroupState()', () => {
    it('calls get_state and returns parsed result', async () => {
      const result = await service.getGroupState(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );

      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'group-1' });
    });

    it('throws BadRequestException when contractAddress is null', async () => {
      await expect(service.getGroupState(null as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getGroupState(null as any)).rejects.toThrow(
        'Contract address is required for getGroupState',
      );
    });

    it('throws BadRequestException when contractAddress is empty string', async () => {
      await expect(service.getGroupState('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getGroupState('')).rejects.toThrow(
        'Contract address is required for getGroupState',
      );
    });

    it('works with different contract addresses', async () => {
      const contractAddress1 =
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const contractAddress2 =
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';

      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: { id: 'group-1' } },
      });
      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: { id: 'group-2' } },
      });

      const result1 = await service.getGroupState(contractAddress1);
      const result2 = await service.getGroupState(contractAddress2);

      expect(result1).toEqual({ id: 'group-1' });
      expect(result2).toEqual({ id: 'group-2' });
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(2);
    });

    it('maps RPC network failures to BadGatewayException', async () => {
      mockServer.simulateTransaction.mockRejectedValue(
        new Error('Network timeout while calling RPC'),
      );

      await expect(
        service.getGroupState(
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getGroupInfo()', () => {
    it('calls get_group_info and returns parsed result', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { retval: { name: 'test-group', size: 5 } },
      });

      const result = await service.getGroupInfo(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );

      expect(result).toEqual({ name: 'test-group', size: 5 });
    });

    it('throws BadRequestException when contractAddress is null', async () => {
      await expect(service.getGroupInfo(null as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getGroupInfo(null as any)).rejects.toThrow(
        'Contract address is required for getGroupInfo',
      );
    });

    it('throws BadRequestException when contractAddress is empty string', async () => {
      await expect(service.getGroupInfo('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('works with different contract addresses', async () => {
      const contractAddress1 =
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const contractAddress2 =
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';

      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: { name: 'group-1', size: 5 } },
      });
      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: { name: 'group-2', size: 10 } },
      });

      const result1 = await service.getGroupInfo(contractAddress1);
      const result2 = await service.getGroupInfo(contractAddress2);

      expect(result1).toEqual({ name: 'group-1', size: 5 });
      expect(result2).toEqual({ name: 'group-2', size: 10 });
    });
  });

  describe('getContractBalance()', () => {
    it('calls get_balance and returns balance as string', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { retval: 1000000 },
      });

      const result = await service.getContractBalance(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );

      expect(result).toBe('1000000');
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when contractAddress is null', async () => {
      await expect(service.getContractBalance(null as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getContractBalance(null as any)).rejects.toThrow(
        'Contract address is required for getContractBalance',
      );
    });

    it('throws BadRequestException when contractAddress is empty string', async () => {
      await expect(service.getContractBalance('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns "0" when balance is null or undefined', async () => {
      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: null },
      });
      const result1 = await service.getContractBalance(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );
      expect(result1).toBe('0');

      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: undefined },
      });
      const result2 = await service.getContractBalance(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );
      expect(result2).toBe('0');
    });

    it('works with different contract addresses', async () => {
      const contractAddress1 =
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const contractAddress2 =
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';

      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: 5000000 },
      });
      mockServer.simulateTransaction.mockResolvedValueOnce({
        result: { retval: 10000000 },
      });

      const result1 = await service.getContractBalance(contractAddress1);
      const result2 = await service.getContractBalance(contractAddress2);

      expect(result1).toBe('5000000');
      expect(result2).toBe('10000000');
    });
  });

  describe('verifyContribution()', () => {
    it('throws BadRequestException when tx hash is empty', async () => {
      await expect(service.verifyContribution('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns true for valid contribute transaction', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'contribute',
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });

      await expect(service.verifyContribution('tx-123')).resolves.toBe(true);
    });

    it('returns false for non-success transactions', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'FAILED',
      });

      await expect(service.verifyContribution('tx-123')).resolves.toBe(false);
    });
  });

  describe('verifyContributionForGroup()', () => {
    it('throws BadRequestException when tx hash is empty', async () => {
      await expect(
        service.verifyContributionForGroup(
          '',
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns true for valid contribute transaction with group contract address', async () => {
      const groupContractAddress =
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'contribute',
        contractAddress: groupContractAddress,
      });

      await expect(
        service.verifyContributionForGroup('tx-123', groupContractAddress),
      ).resolves.toBe(true);
    });

    it('returns true for valid contribute transaction with null group contract address (uses global)', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'contribute',
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });

      await expect(
        service.verifyContributionForGroup('tx-123', null),
      ).resolves.toBe(true);
    });

    it('returns false when transaction is against wrong contract address', async () => {
      const groupContractAddress =
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';
      const wrongContractAddress =
        'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCSC4';
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'contribute',
        contractAddress: wrongContractAddress,
      });

      await expect(
        service.verifyContributionForGroup('tx-123', groupContractAddress),
      ).resolves.toBe(false);
    });

    it('returns false for non-success transactions', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'FAILED',
      });

      await expect(
        service.verifyContributionForGroup(
          'tx-123',
          'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
        ),
      ).resolves.toBe(false);
    });

    it('returns false when transaction is not a contribute call', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'withdraw',
        contractAddress:
          'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
      });

      await expect(
        service.verifyContributionForGroup(
          'tx-123',
          'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
        ),
      ).resolves.toBe(false);
    });
  });

  describe('verifySignature()', () => {
    it('returns true when Stellar signature is valid', () => {
      const keypair = (StellarSdk as any).Keypair.random();
      const message = 'Sign In With Stellar';
      const signature = keypair.sign(Buffer.from(message)).toString('base64');

      expect(
        service.verifySignature(keypair.publicKey(), message, signature),
      ).toBe(true);
    });

    it('returns false for malformed signature payload', () => {
      const keypair = (StellarSdk as any).Keypair.random();
      const message = 'Sign In With Stellar';

      expect(
        service.verifySignature(keypair.publicKey(), message, 'not-base64!'),
      ).toBe(false);
    });
  });

  describe('configuration handling', () => {
    it('throws InternalServerErrorException when CONTRACT_ADDRESS is missing', async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'CONTRACT_ADDRESS') {
            return '';
          }
          const values: Record<string, string> = {
            STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
            STELLAR_NETWORK: 'testnet',
            STELLAR_NETWORK_PASSPHRASE: (StellarSdk as any).Networks.TESTNET,
          };
          return values[key] ?? defaultValue;
        },
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredService = module.get<StellarService>(StellarService);
      await expect(
        configuredService.getGroupState(
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
