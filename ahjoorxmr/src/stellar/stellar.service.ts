import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import type { Group } from '../groups/entities/group.entity';

type SimulateTransactionResponse = {
  error?: string;
  result?: {
    retval?: unknown;
    retVal?: unknown;
  };
  retval?: unknown;
};

@Injectable()
export class StellarService {
  private readonly rpcUrl: string;
  private readonly networkPassphrase: string;
  private readonly defaultContractAddress: string;
  private readonly server: any;

  constructor(private readonly configService: ConfigService) {
    this.rpcUrl = this.configService.get<string>('STELLAR_RPC_URL') ?? '';
    this.defaultContractAddress =
      this.configService.get<string>('CONTRACT_ADDRESS') ?? '';

    const network = (
      this.configService.get<string>('STELLAR_NETWORK', 'testnet') ?? 'testnet'
    ).toLowerCase();
    const defaultPassphrase =
      network === 'mainnet'
        ? (StellarSdk as any).Networks.PUBLIC
        : (StellarSdk as any).Networks.TESTNET;

    this.networkPassphrase =
      this.configService.get<string>(
        'STELLAR_NETWORK_PASSPHRASE',
        defaultPassphrase,
      ) ?? defaultPassphrase;

    this.server = new (SorobanRpc as any).Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
    });
  }

  async deployRoscaContract(group: Group): Promise<string> {
    if (!group || !group.id) {
      throw new BadRequestException('Invalid group for contract deployment');
    }
    const normalized = String(group.id)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    const addr = `C${normalized.slice(0, 55)}`;
    return Promise.resolve(addr);
  }

  async getGroupState(contractAddress: string): Promise<unknown> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for getGroupState',
      );
    }
    return this.invokeContractMethod(contractAddress, 'get_state');
  }

  async getGroupInfo(contractAddress: string): Promise<unknown> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for getGroupInfo',
      );
    }
    return this.invokeContractMethod(contractAddress, 'get_group_info');
  }

  async getContractBalance(contractAddress: string): Promise<string> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for getContractBalance',
      );
    }
    const result = await this.invokeContractMethod(
      contractAddress,
      'get_balance',
    );
    return String(result ?? '0');
  }

  async verifyContribution(txHash: string): Promise<boolean> {
    if (!txHash) {
      throw new BadRequestException('Transaction hash is required');
    }

    this.validateConfiguration();
    try {
      const transaction = await this.server.getTransaction(txHash);
      if (!transaction) {
        return false;
      }

      const status = String(
        transaction.status ?? transaction.txStatus ?? '',
      ).toLowerCase();
      if (status && status !== 'success') {
        return false;
      }

      return this.isContributionCall(transaction);
    } catch (error) {
      throw this.mapRpcError(
        'Unable to verify contribution transaction',
        error,
      );
    }
  }

  /**
   * Verifies a contribution transaction against a specific group's contract address.
   * Falls back to the global CONTRACT_ADDRESS if the group's contractAddress is null.
   *
   * @param txHash - The transaction hash to verify
   * @param groupContractAddress - The group's specific contract address (can be null)
   * @returns true if the transaction is a valid contribution to the specified contract
   * @throws BadRequestException if transaction hash is missing
   * @throws BadGatewayException if RPC communication fails
   * @throws InternalServerErrorException if configuration is missing
   */
  async verifyContributionForGroup(
    txHash: string,
    groupContractAddress: string | null,
  ): Promise<boolean> {
    if (!txHash) {
      throw new BadRequestException('Transaction hash is required');
    }

    this.validateConfiguration();
    try {
      const transaction = await this.server.getTransaction(txHash);
      if (!transaction) {
        return false;
      }

      const status = String(
        transaction.status ?? transaction.txStatus ?? '',
      ).toLowerCase();
      if (status && status !== 'success') {
        return false;
      }

      return this.isContributionCallForGroup(transaction, groupContractAddress);
    } catch (error) {
      throw this.mapRpcError(
        'Unable to verify contribution transaction',
        error,
      );
    }
  }

  verifySignature(
    walletAddress: string,
    message: string,
    signature: string,
  ): boolean {
    try {
      const keyPair = (StellarSdk as any).Keypair.fromPublicKey(walletAddress);
      const messageBuffer = Buffer.from(message, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'base64');
      return keyPair.verify(messageBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  private async invokeContractMethod(
    contractAddress: string,
    method: string,
  ): Promise<unknown> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for contract method invocation',
      );
    }
    this.validateConfiguration();

    try {
      const sourceAccount = new (StellarSdk as any).Account(
        (StellarSdk as any).Keypair.random().publicKey(),
        '0',
      );
      let operation: unknown;
      try {
        const contract = new (StellarSdk as any).Contract(contractAddress);
        operation = contract.call(method);
      } catch {
        operation = {
          contractAddress: contractAddress,
          method,
        };
      }
      let tx: unknown;
      try {
        const txBuilder = new (StellarSdk as any).TransactionBuilder(
          sourceAccount,
          {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
          },
        );
        tx = txBuilder.addOperation(operation).setTimeout(30).build();
      } catch {
        tx = {
          contractAddress: contractAddress,
          method,
          networkPassphrase: this.networkPassphrase,
        };
      }
      if (typeof this.server.prepareTransaction === 'function') {
        tx = await this.server.prepareTransaction(tx);
      }

      const simulation = (await this.server.simulateTransaction(
        tx,
      )) as SimulateTransactionResponse;

      if (simulation?.error) {
        throw new BadGatewayException(
          `Soroban simulation failed: ${simulation.error}`,
        );
      }

      const rawResult =
        simulation?.result?.retval ??
        simulation?.result?.retVal ??
        simulation?.retval;

      return this.parseResult(rawResult);
    } catch (error) {
      throw this.mapRpcError(
        `Failed to call contract method "${method}"`,
        error,
      );
    }
  }

  private parseResult(rawResult: unknown): unknown {
    if (rawResult === undefined || rawResult === null) {
      return rawResult;
    }

    try {
      return (StellarSdk as any).scValToNative(rawResult);
    } catch {
      if (typeof rawResult !== 'string') {
        return rawResult;
      }

      try {
        const scVal = (StellarSdk as any).xdr.ScVal.fromXDR(
          rawResult,
          'base64',
        );
        return (StellarSdk as any).scValToNative(scVal);
      } catch {
        return rawResult;
      }
    }
  }

  private isContributionCall(transaction: any): boolean {
    const contractAddress = this.resolveContractAddress();
    if (!contractAddress) {
      return false;
    }

    const directMethod = String(
      transaction.functionName ??
        transaction.function_name ??
        transaction.method ??
        '',
    ).toLowerCase();
    const directContract = String(
      transaction.contractAddress ??
        transaction.contract_address ??
        transaction.contractId ??
        '',
    );

    if (
      directMethod === 'contribute' &&
      (!directContract || directContract === contractAddress)
    ) {
      return true;
    }

    const envelopeXdr =
      transaction.envelopeXdr ??
      transaction.envelope_xdr ??
      transaction.envelope;
    if (!envelopeXdr || typeof envelopeXdr !== 'string') {
      return false;
    }

    try {
      const envelope = (StellarSdk as any).xdr.TransactionEnvelope.fromXDR(
        envelopeXdr,
        'base64',
      );
      const txContainer =
        (typeof envelope.v1 === 'function' && envelope.v1()?.tx?.()) ||
        (typeof envelope.tx === 'function' && envelope.tx()) ||
        null;
      const operations = txContainer?.operations?.() ?? [];

      for (const operation of operations) {
        const body = operation.body?.();
        const invokeOp = body?.invokeHostFunctionOp?.();
        const hostFunction = invokeOp?.hostFunction?.();
        const invokeContract = hostFunction?.invokeContract?.();

        if (!invokeContract) {
          continue;
        }

        const functionName = this.readFunctionName(invokeContract);
        const operationContract = this.readContractAddress(invokeContract);
        if (
          functionName === 'contribute' &&
          (!operationContract || operationContract === contractAddress)
        ) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }
  /**
   * Checks if a transaction is a contribution call to a specific contract address.
   * Falls back to the global CONTRACT_ADDRESS if groupContractAddress is null.
   *
   * @param transaction - The transaction object from Stellar RPC
   * @param groupContractAddress - The group's specific contract address (can be null)
   * @returns true if the transaction is a 'contribute' call to the specified contract
   * @private
   */
  private isContributionCallForGroup(
    transaction: any,
    groupContractAddress: string | null,
  ): boolean {
    const contractAddress = groupContractAddress || this.defaultContractAddress;
    if (!contractAddress) {
      return false;
    }

    const directMethod = String(
      transaction.functionName ??
        transaction.function_name ??
        transaction.method ??
        '',
    ).toLowerCase();
    const directContract = String(
      transaction.contractAddress ??
        transaction.contract_address ??
        transaction.contractId ??
        '',
    );

    if (
      directMethod === 'contribute' &&
      (!directContract || directContract === contractAddress)
    ) {
      return true;
    }

    const envelopeXdr =
      transaction.envelopeXdr ??
      transaction.envelope_xdr ??
      transaction.envelope;
    if (!envelopeXdr || typeof envelopeXdr !== 'string') {
      return false;
    }

    try {
      const envelope = (StellarSdk as any).xdr.TransactionEnvelope.fromXDR(
        envelopeXdr,
        'base64',
      );
      const txContainer =
        (typeof envelope.v1 === 'function' && envelope.v1()?.tx?.()) ||
        (typeof envelope.tx === 'function' && envelope.tx()) ||
        null;
      const operations = txContainer?.operations?.() ?? [];

      for (const operation of operations) {
        const body = operation.body?.();
        const invokeOp = body?.invokeHostFunctionOp?.();
        const hostFunction = invokeOp?.hostFunction?.();
        const invokeContract = hostFunction?.invokeContract?.();

        if (!invokeContract) {
          continue;
        }

        const functionName = this.readFunctionName(invokeContract);
        const operationContract = this.readContractAddress(invokeContract);
        if (
          functionName === 'contribute' &&
          (!operationContract || operationContract === contractAddress)
        ) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  private readFunctionName(invokeContract: any): string | null {
    try {
      const symbolScVal = invokeContract.functionName?.();
      return String(symbolScVal?.toString?.() ?? '').toLowerCase() || null;
    } catch {
      return null;
    }
  }

  private readContractAddress(invokeContract: any): string | null {
    try {
      const contractScAddress = invokeContract.contractAddress?.();
      const asText = String(contractScAddress?.toString?.() ?? '');
      return asText || null;
    } catch {
      return null;
    }
  }

  private resolveContractAddress(contractAddress?: string): string {
    return contractAddress || this.defaultContractAddress;
  }

  private validateConfiguration(): void {
    if (!this.rpcUrl) {
      throw new InternalServerErrorException(
        'Missing STELLAR_RPC_URL configuration',
      );
    }

    if (!this.networkPassphrase) {
      throw new InternalServerErrorException(
        'Missing STELLAR_NETWORK_PASSPHRASE configuration',
      );
    }

    if (!this.defaultContractAddress) {
      throw new InternalServerErrorException(
        'Missing CONTRACT_ADDRESS configuration',
      );
    }
  }

  private mapRpcError(message: string, error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown Stellar RPC error';
    const lowered = errorMessage.toLowerCase();

    if (
      lowered.includes('network') ||
      lowered.includes('timeout') ||
      lowered.includes('connect')
    ) {
      return new BadGatewayException(`${message}: ${errorMessage}`);
    }

    return new InternalServerErrorException(`${message}: ${errorMessage}`);
  }
}
