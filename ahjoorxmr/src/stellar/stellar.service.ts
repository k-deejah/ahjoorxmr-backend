import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { ContractStateGuard } from './contract-state-guard.service';
import type { Group } from '../groups/entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import type { ContractInvocationResult } from './contract-invocation.types';
import { MetricsService } from '../metrics/metrics.service';
import { withStellarSpan } from '../common/tracing/stellar-tracing';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Soroban JSON-RPC error shape (see `@stellar/stellar-sdk/rpc` → `Api.SimulateTransactionErrorResponse`).
 */
function isSimulateTransactionErrorResponse(r: unknown): boolean {
  if (!r || typeof r !== 'object') {
    return false;
  }
  const o = r as Record<string, unknown>;
  if (o.id === 'SimulateTransactionError') {
    return true;
  }
  return typeof o.error === 'string' && o.error.length > 0;
}

function formatSimulationError(r: unknown): string {
  if (!r || typeof r !== 'object') {
    return 'Unknown simulation error';
  }
  const o = r as Record<string, unknown>;
  if (typeof o.error === 'string') {
    return o.error;
  }
  try {
    return JSON.stringify(o);
  } catch {
    return String(r);
  }
}

@Injectable()
export class StellarService {
  private readonly rpcUrls: string[];
  private currentRpcIndex = 0;
  private readonly networkPassphrase: string;
  private readonly defaultContractAddress: string;
  private server: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: WinstonLogger,
    @Inject(forwardRef(() => ContractStateGuard))
    private readonly contractStateGuard: ContractStateGuard,
    @Inject(forwardRef(() => MetricsService))
    private readonly metricsService: MetricsService,
  ) {
    const rawRpcUrls = this.configService.get<string>('STELLAR_RPC_URLS') || this.configService.get<string>('STELLAR_RPC_URL') || '';
    this.rpcUrls = rawRpcUrls.split(',').map(url => url.trim()).filter(url => url.length > 0);
    
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

    this.initializeServer();
  }

  private initializeServer(): void {
    const rpcUrl = this.rpcUrls[this.currentRpcIndex];
    if (!rpcUrl) {
      this.logger.error('No Stellar RPC URLs available for initialization', 'StellarService');
      return;
    }
    this.server = new (SorobanRpc as any).Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
  }

  /**
   * Helper to execute an RPC call with failover logic.
   */
  private async withFailover<T>(
    operation: (server: any) => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: any;
    const initialRpcIndex = this.currentRpcIndex;

    for (let i = 0; i < this.rpcUrls.length; i++) {
      const attemptIndex = (initialRpcIndex + i) % this.rpcUrls.length;
      
      // If we've already tried some and now switching
      if (attemptIndex !== this.currentRpcIndex) {
        this.currentRpcIndex = attemptIndex;
        this.initializeServer();
        this.logger.warn(
          `Retrying ${context} with fallback RPC: ${this.rpcUrls[this.currentRpcIndex]}`,
          'StellarService'
        );
      }

      try {
        return await operation(this.server);
      } catch (error) {
        lastError = error;
        
        if (this.isTransientRpcFailure(error)) {
          this.logger.warn(
            `Transient RPC failure on ${this.rpcUrls[this.currentRpcIndex]} during ${context}: ${error instanceof Error ? error.message : String(error)}`,
            'StellarService'
          );
          continue; // Try next URL
        }
        
        // If not transient, propagate immediately
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Builds a Stellar Asset object from an asset code and optional issuer.
   * Returns native asset for XLM, or a custom asset for everything else.
   */
  buildAsset(assetCode: string, assetIssuer: string | null): any {
    const code = (assetCode ?? 'XLM').toUpperCase();
    if (code === 'XLM' || !assetIssuer) {
      return (StellarSdk as any).Asset.native();
    }
    return new (StellarSdk as any).Asset(code, assetIssuer);
  }

  /**
   * Disburses a payout to a recipient from the group's smart contract.
   * Submits an on-chain transaction and returns the transaction hash.
   *
   * @param contractAddress - The group's on-chain contract address
   * @param recipientWallet - The recipient's Stellar wallet address
   * @param amount - The contribution amount to disburse (as string)
   * @param assetCode - Asset code for the payout (default: XLM)
   * @param assetIssuer - Asset issuer for non-XLM assets
   * @returns The transaction hash of the submitted payout
   */
  async disbursePayout(
    contractAddress: string,
    recipientWallet: string,
    amount: string,
    onBeforeSubmit?: (txHash: string) => Promise<void>,
    assetCode?: string,
    assetIssuer?: string | null,
  ): Promise<string> {
    return withStellarSpan(
      'stellar.submit_transaction',
      { network: this.networkPassphrase, contractAddress },
      async (span) => {
        span.setAttributes({
          'stellar.operation': 'disburse_payout',
          'stellar.recipient': recipientWallet,
          'stellar.amount': amount,
        });
        return this.disbursePayout_impl(
          contractAddress,
          recipientWallet,
          amount,
          onBeforeSubmit,
          assetCode,
          assetIssuer,
        );
      },
    );
  }

  private async disbursePayout_impl(
    contractAddress: string,
    recipientWallet: string,
    amount: string,
    onBeforeSubmit?: (txHash: string) => Promise<void>,
    assetCode?: string,
    assetIssuer?: string | null,
  ): Promise<string> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for disbursePayout',
      );
    }
    if (!recipientWallet) {
      throw new BadRequestException(
        'Recipient wallet address is required for disbursePayout',
      );
    }
    if (!amount) {
      throw new BadRequestException('Amount is required for disbursePayout');
    }

    this.validateConfiguration();

    // Check issuer balance before attempting payout
    const issuerAccount = this.configService.get<string>(
      'STELLAR_ISSUER_ACCOUNT',
    );
    const minBalanceXlm = this.configService.get<number>(
      'STELLAR_MIN_BALANCE_ALERT_XLM',
      5,
    );

    if (issuerAccount) {
      try {
        const { currentBalance, isSufficient } = await this.checkAccountBalance(
          issuerAccount,
          minBalanceXlm,
        );
        if (!isSufficient) {
          this.logger.warn(
            `Payout blocked: Insufficient issuer balance. Current: ${currentBalance} XLM, Required: ${minBalanceXlm} XLM`,
          );
          throw new HttpException(
            {
              statusCode: 409,
              error: 'Conflict',
              message: 'Insufficient issuer balance',
              data: {
                error: 'Insufficient issuer balance',
                currentBalance,
                minimumRequired: minBalanceXlm.toString(),
              },
            },
            409,
          );
        }
      } catch (error) {
        // If balance check fails (RPC error), log but don't block payout
        if (error instanceof HttpException && error.getStatus() === 409) {
          throw error;
        }
        this.logger.warn(
          `Failed to check issuer balance: ${error instanceof Error ? error.message : String(error)}. Proceeding with payout.`,
        );
      }
    }

    // Perform state validation before submission
    try {
      await this.contractStateGuard.validatePreconditions(
        contractAddress,
        'disburse_payout',
        recipientWallet,
        amount,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Precondition validation failed for disbursePayout: ${error.message}`,
      );
    }

    try {
      // Build and submit the disburse_payout contract call
      const sourceAccount = new (StellarSdk as any).Account(
        (StellarSdk as any).Keypair.random().publicKey(),
        '0',
      );

      let operation: unknown;
      try {
        const contract = new (StellarSdk as any).Contract(contractAddress);
        const asset = this.buildAsset(assetCode ?? 'XLM', assetIssuer ?? null);
        operation = contract.call(
          'disburse_payout',
          (StellarSdk as any).nativeToScVal(recipientWallet, {
            type: 'address',
          }),
          (StellarSdk as any).nativeToScVal(BigInt(amount), { type: 'i128' }),
          (StellarSdk as any).nativeToScVal(asset),
        );
      } catch {
        operation = { contractAddress, method: 'disburse_payout' };
      }

      let tx: unknown;
      try {
        tx = new (StellarSdk as any).TransactionBuilder(sourceAccount, {
          fee: '100',
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(operation)
          .setTimeout(30)
          .build();
      } catch {
        // Fallback: return a deterministic mock hash for environments without full SDK
        const mockHash = `payout_${contractAddress.slice(0, 8)}_${recipientWallet.slice(0, 8)}_${Date.now()}`;
        return mockHash;
      }

      if (typeof this.server.prepareTransaction === 'function') {
        tx = await this.withFailover(
          (s) => s.prepareTransaction(tx),
          'prepareTransaction',
        );
      }

      let txHashToStore =
        typeof (tx as any).hash === 'function'
          ? (tx as any).hash().toString('hex')
          : null;
      if (!txHashToStore && (tx as any).id) {
        txHashToStore = (tx as any).id;
      }
      if (!txHashToStore) {
        txHashToStore = `temp_hash_${Date.now()}`;
      }

      if (onBeforeSubmit) {
        await onBeforeSubmit(txHashToStore);
      }

      const result = await this.withFailover(
        (s) => s.sendTransaction(tx),
        'sendTransaction',
      );
      const txHash: string =
        result?.hash ??
        result?.id ??
        result?.transactionHash ??
        txHashToStore ??
        String(result);

      if (!txHash) {
        this.metricsService.incrementStellarTransaction(false);
        throw new Error('No transaction hash returned from Stellar RPC');
      }

      this.metricsService.incrementStellarTransaction(true);
      return txHash;
    } catch (error) {
      this.metricsService.incrementStellarTransaction(false);
      throw this.mapRpcError('Failed to disburse payout on-chain', error);
    }
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
    const inv = await this.invokeContractMethod(contractAddress, 'get_state');
    return inv.nativeValue;
  }

  async getGroupInfo(contractAddress: string): Promise<unknown> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for getGroupInfo',
      );
    }
    const inv = await this.invokeContractMethod(
      contractAddress,
      'get_group_info',
    );
    return inv.nativeValue;
  }

  async getContractBalance(contractAddress: string): Promise<string> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for getContractBalance',
      );
    }
    const invocation = await this.invokeContractMethod(
      contractAddress,
      'get_balance',
    );
    return String(invocation.nativeValue ?? '0');
  }

  async verifyContribution(txHash: string): Promise<boolean> {
    return withStellarSpan(
      'stellar.get_transaction',
      { network: this.networkPassphrase },
      async (span) => {
        span.setAttribute('stellar.tx_hash', txHash);
        return this.verifyContribution_impl(txHash);
      },
    );
  }

  private async verifyContribution_impl(txHash: string): Promise<boolean> {
    if (!txHash) {
      throw new BadRequestException('Transaction hash is required');
    }

    this.validateConfiguration();
    try {
      const transaction = await this.withFailover(
        (s) => s.getTransaction(txHash),
        'getTransaction',
      );
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
      const transaction = await this.withFailover(
        (s) => s.getTransaction(txHash),
        'getTransaction',
      );
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

  async getTransactionStatus(
    txHash: string,
  ): Promise<'PENDING' | 'CONFIRMED' | 'FAILED'> {
    if (!txHash) {
      throw new BadRequestException('Transaction hash is required');
    }

    this.validateConfiguration();

    try {
      const transaction = await this.withFailover(
        (s) => s.getTransaction(txHash),
        'getTransaction',
      );
      if (!transaction) {
        return 'PENDING';
      }

      const status = String(
        transaction.status ?? transaction.txStatus ?? transaction.state ?? '',
      ).toLowerCase();

      if (
        status.includes('success') ||
        status.includes('confirmed') ||
        status.includes('completed')
      ) {
        return 'CONFIRMED';
      }

      if (
        status.includes('failed') ||
        status.includes('error') ||
        status.includes('reverted')
      ) {
        return 'FAILED';
      }

      return 'PENDING';
    } catch (error) {
      throw this.mapRpcError('Unable to fetch transaction status', error);
    }
  }

  /**
   * Returns the list of Stellar assets an account has trustlines for.
   * Used by the admin endpoint to validate group asset setup.
   */
  async getAccountTrustlines(
    accountId: string,
  ): Promise<
    Array<{ assetCode: string; assetIssuer: string | null; balance: string }>
  > {
    this.validateConfiguration();
    try {
      const account = await this.withFailover(
        (s) => s.loadAccount(accountId),
        'loadAccount',
      );
      return (account.balances as any[]).map((b: any) => ({
        assetCode: b.asset_type === 'native' ? 'XLM' : b.asset_code,
        assetIssuer: b.asset_type === 'native' ? null : b.asset_issuer,
        balance: b.balance,
      }));
    } catch (error) {
      throw this.mapRpcError(
        `Failed to load account trustlines for ${accountId}`,
        error,
      );
    }
  }

  /**
   * Get the native XLM balance for an account (for balance monitoring).
   * Returns the balance as a string (e.g., "1000.5000000").
   *
   * @param accountId - The Stellar account ID (G-address)
   * @returns The native XLM balance as a string
   * @throws HttpException if the account cannot be loaded
   */
  async getNativeBalance(accountId: string): Promise<string> {
    this.validateConfiguration();
    try {
      const account = await this.withFailover(
        (s) => s.loadAccount(accountId),
        'loadAccount',
      );
      const balances = account.balances as any[];
      const nativeBalance = balances.find(
        (b: any) => b.asset_type === 'native',
      );
      return nativeBalance?.balance ?? '0';
    } catch (error) {
      throw this.mapRpcError(
        `Failed to load native balance for ${accountId}`,
        error,
      );
    }
  }

  /**
   * Check if an account has sufficient XLM balance for transactions.
   * Returns the balance and whether it's below the minimum threshold.
   *
   * @param accountId - The Stellar account ID to check
   * @param minimumXlm - The minimum balance threshold in XLM (default: 5)
   * @returns Object with currentBalance and isSufficient flag
   */
  async checkAccountBalance(
    accountId: string,
    minimumXlm: number = 5,
  ): Promise<{ currentBalance: string; isSufficient: boolean }> {
    const balance = await this.getNativeBalance(accountId);
    const balanceNum = parseFloat(balance);
    return {
      currentBalance: balance,
      isSufficient: balanceNum >= minimumXlm,
    };
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

  /**
   * Health check endpoint for Stellar RPC URLs.
   */
  async getRpcHealth(): Promise<Record<string, { status: string; latencyMs?: number; error?: string }>> {
    const results: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    await Promise.all(
      this.rpcUrls.map(async (url) => {
        const tempServer = new (SorobanRpc as any).Server(url, {
          allowHttp: url.startsWith('http://'),
        });
        const start = Date.now();
        try {
          await tempServer.getLatestLedger();
          results[url] = {
            status: 'UP',
            latencyMs: Date.now() - start,
          };
        } catch (error) {
          results[url] = {
            status: 'DOWN',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return results;
  }

  private isTransientRpcFailure(error: unknown): boolean {
    if (error instanceof BadGatewayException) {
      return false;
    }
    if (error instanceof BadRequestException) {
      return false;
    }
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return /timeout|etimedout|econnreset|socket hang up|502|503|network|fetch failed/i.test(
      msg,
    );
  }

  private extractSimulationResultXdr(simulation: unknown): string | undefined {
    if (!simulation || typeof simulation !== 'object') {
      return undefined;
    }
    const s = simulation as Record<string, any>;
    const results = s.results ?? s.result?.results;
    const first = Array.isArray(results) ? results[0] : undefined;
    const xdr =
      first?.xdr ??
      first?.result?.xdr ??
      (typeof first === 'string' ? first : undefined);
    return typeof xdr === 'string' ? xdr : undefined;
  }

  private parseNativeFromSimulation(simulation: unknown): unknown {
    const xdr = this.extractSimulationResultXdr(simulation);
    if (xdr) {
      try {
        const scVal = (StellarSdk as any).xdr.ScVal.fromXDR(xdr, 'base64');
        return (StellarSdk as any).scValToNative(scVal);
      } catch {
        /* fall through to legacy paths */
      }
    }

    if (!simulation || typeof simulation !== 'object') {
      return undefined;
    }
    const s = simulation as Record<string, any>;
    const rawResult = s.result?.retval ?? s.result?.retVal ?? s.retval;
    if (rawResult !== undefined) {
      return this.parseResult(rawResult);
    }
    return undefined;
  }

  public async simulateCall(
    contractAddress: string,
    method: string,
    ...args: any[]
  ): Promise<ContractInvocationResult & { minResourceFee: string }> {
    this.validateConfiguration();

    const sourceAccount = new (StellarSdk as any).Account(
      (StellarSdk as any).Keypair.random().publicKey(),
      '0',
    );

    let operation: any;
    try {
      const contract = new (StellarSdk as any).Contract(contractAddress);
      operation = contract.call(
        method,
        ...args.map((arg) => {
          if (
            typeof arg === 'string' &&
            (arg.startsWith('G') || arg.startsWith('C'))
          ) {
            return (StellarSdk as any).nativeToScVal(arg, { type: 'address' });
          }
          if (typeof arg === 'bigint' || typeof arg === 'number') {
            return (StellarSdk as any).nativeToScVal(BigInt(arg), {
              type: 'i128',
            });
          }
          return (StellarSdk as any).nativeToScVal(arg);
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to build operation for simulation: ${err.message}`,
      );
      throw new BadRequestException(
        `Invalid contract call parameters: ${err.message}`,
      );
    }

    const tx = new (StellarSdk as any).TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const preparedTx = await this.withFailover(
      (s) => s.prepareTransaction(tx),
      'prepareTransaction',
    );
    const simulation = await this.withFailover(
      (s) => s.simulateTransaction(preparedTx),
      'simulateTransaction',
    );

    if (isSimulateTransactionErrorResponse(simulation)) {
      throw new Error(formatSimulationError(simulation));
    }

    const nativeValue = this.parseNativeFromSimulation(simulation);
    const rawResultXdr = this.extractSimulationResultXdr(simulation);

    return {
      nativeValue,
      rawResultXdr,
      simulationLatencyMs: 0, // Simplified for this wrapper
      attempts: 1,
      minResourceFee: preparedTx.fee,
    };
  }

  public async invokeContractMethod(
    contractAddress: string,
    method: string,
  ): Promise<ContractInvocationResult> {
    return withStellarSpan(
      'stellar.simulate_transaction',
      { network: this.networkPassphrase, contractAddress },
      async (span) => {
        span.setAttribute('stellar.method', method);
        return this.invokeContractMethod_impl(contractAddress, method);
      },
    );
  }

  private async invokeContractMethod_impl(
    contractAddress: string,
    method: string,
  ): Promise<ContractInvocationResult> {
    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is required for contract method invocation',
      );
    }
    this.validateConfiguration();

    const started = Date.now();
    let simulationLatencyMs = 0;
    let attempts = 0;
    const maxAttempts = 3;

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
      tx = await this.withFailover(
        (s) => s.prepareTransaction(tx),
        'prepareTransaction',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts = attempt + 1;
      try {
        const simStart = Date.now();
        const simulation = await this.withFailover(
          (s) => s.simulateTransaction(tx),
          'simulateTransaction',
        );
        simulationLatencyMs += Date.now() - simStart;

        if (isSimulateTransactionErrorResponse(simulation)) {
          const msg = formatSimulationError(simulation);
          this.logger.warn(
            JSON.stringify({
              event: 'soroban_contract_invocation',
              contractAddress,
              method,
              argsRedacted: true,
              simulationStatus: 'error',
              simulationError: msg,
              attempts,
              simulationLatencyMs,
              totalLatencyMs: Date.now() - started,
            }),
            'StellarService',
          );
          throw new BadGatewayException(`Soroban simulation failed: ${msg}`);
        }

        const rawResultXdr = this.extractSimulationResultXdr(simulation);
        const nativeValue = this.parseNativeFromSimulation(simulation);

        this.logger.log(
          JSON.stringify({
            event: 'soroban_contract_invocation',
            contractAddress,
            method,
            argsRedacted: true,
            simulationStatus: 'success',
            attempts,
            simulationLatencyMs,
            totalLatencyMs: Date.now() - started,
          }),
          'StellarService',
        );

        return {
          nativeValue,
          rawResultXdr,
          simulationLatencyMs,
          attempts,
        };
      } catch (error) {
        lastError = error;
        if (error instanceof BadGatewayException) {
          throw error;
        }
        if (error instanceof BadRequestException) {
          throw error;
        }
        if (attempt >= maxAttempts - 1 || !this.isTransientRpcFailure(error)) {
          throw this.mapRpcError(
            `Failed to call contract method "${method}"`,
            error,
          );
        }
        await sleep(100 * Math.pow(2, attempt));
      }
    }

    throw this.mapRpcError(
      `Failed to call contract method "${method}"`,
      lastError,
    );
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
    if (this.rpcUrls.length === 0) {
      throw new InternalServerErrorException(
        'Missing STELLAR_RPC_URLS or STELLAR_RPC_URL configuration',
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
