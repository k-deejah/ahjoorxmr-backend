import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Group } from '../groups/entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';

type HorizonTransactionRecord = {
  id: string;
  hash: string;
  successful: boolean;
  ledger: number;
  result_meta_xdr?: string;
  created_at?: string;
};

type HorizonTransactionsResponse = {
  _embedded?: {
    records?: HorizonTransactionRecord[];
  };
};

type ParsedDiagnosticEvent = {
  name: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class EventListenerService {
  private readonly horizonUrl: string;
  private readonly contractAddress: string;
  private readonly pollIntervalMs: number;
  private readonly ledgerCheckpointKey: string;

  private pollingEnabled = true;
  private lastRunAtMs = 0;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly logger: WinstonLogger,
  ) {
    this.horizonUrl = (
      this.configService.get<string>('STELLAR_HORIZON_URL') ??
      this.configService.get<string>('STELLAR_RPC_URL') ??
      'https://horizon-testnet.stellar.org'
    ).replace(/\/+$/, '');
    this.contractAddress =
      this.configService.get<string>('CONTRACT_ADDRESS') ?? '';

    const intervalFromEnv = parseInt(
      this.configService.get<string>('EVENT_POLL_INTERVAL_MS', '15000') ??
        '15000',
      10,
    );
    this.pollIntervalMs =
      Number.isFinite(intervalFromEnv) && intervalFromEnv > 0
        ? intervalFromEnv
        : 15000;
    this.ledgerCheckpointKey = `event-listener:last-processed-ledger:${this.contractAddress}`;
  }

  @Interval(1000)
  async pollTick(): Promise<void> {
    if (!this.pollingEnabled) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRunAtMs < this.pollIntervalMs) {
      return;
    }
    this.lastRunAtMs = now;

    try {
      await this.pollNow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Event polling failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
        EventListenerService.name,
      );
    }
  }

  async pollNow(): Promise<void> {
    if (!this.contractAddress) {
      this.logger.warn(
        'Skipping event polling because CONTRACT_ADDRESS is not configured',
        EventListenerService.name,
      );
      return;
    }

    const lastProcessedLedger = await this.getLastProcessedLedger();
    const transactions = await this.fetchTransactionsSince(lastProcessedLedger);

    for (const tx of transactions) {
      if (!tx || !tx.ledger || tx.ledger <= lastProcessedLedger) {
        continue;
      }
      if (await this.isAlreadyProcessed(tx.hash)) {
        await this.setLastProcessedLedger(tx.ledger);
        continue;
      }

      if (!tx.successful) {
        await this.markProcessed(tx.hash);
        await this.setLastProcessedLedger(tx.ledger);
        continue;
      }

      try {
        const events = this.parseDiagnosticEvents(tx.result_meta_xdr);
        for (const event of events) {
          await this.handleParsedEvent(event, tx);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to process tx ${tx.hash}: ${message}`,
          error instanceof Error ? error.stack : undefined,
          EventListenerService.name,
        );
      } finally {
        await this.markProcessed(tx.hash);
        await this.setLastProcessedLedger(tx.ledger);
      }
    }
  }

  startPolling(): void {
    this.pollingEnabled = true;
  }

  stopPolling(): void {
    this.pollingEnabled = false;
  }

  getPollingStatus(): { running: boolean; pollIntervalMs: number } {
    return {
      running: this.pollingEnabled,
      pollIntervalMs: this.pollIntervalMs,
    };
  }

  private async fetchTransactionsSince(
    lastProcessedLedger: number,
  ): Promise<HorizonTransactionRecord[]> {
    const candidatePaths = [
      `/contracts/${encodeURIComponent(this.contractAddress)}/transactions`,
      `/accounts/${encodeURIComponent(this.contractAddress)}/transactions`,
    ];

    for (const path of candidatePaths) {
      const endpoint = new URL(`${this.horizonUrl}${path}`);
      endpoint.searchParams.set('order', 'asc');
      endpoint.searchParams.set('limit', '200');
      if (lastProcessedLedger > 0) {
        endpoint.searchParams.set('cursor', String(lastProcessedLedger));
      }

      const response = await fetch(endpoint.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const body = (await response.json()) as HorizonTransactionsResponse;
        return body._embedded?.records ?? [];
      }

      if (response.status === 404) {
        continue;
      }

      throw new Error(`Horizon request failed with status ${response.status}`);
    }

    return [];
  }

  private parseDiagnosticEvents(
    resultMetaXdr?: string,
  ): ParsedDiagnosticEvent[] {
    if (!resultMetaXdr) {
      return [];
    }

    const txMeta = (StellarSdk as any).xdr.TransactionMeta.fromXDR(
      resultMetaXdr,
      'base64',
    );
    const metaSwitch = txMeta.switch();

    if (metaSwitch === 3) {
      const sorobanMeta = txMeta.v3()?.sorobanMeta();
      const diagnosticEvents = sorobanMeta?.diagnosticEvents?.() ?? [];
      return diagnosticEvents
        .map((diagnosticEvent: any) =>
          this.normalizeContractEvent(diagnosticEvent?.event?.()),
        )
        .filter(
          (
            event: ParsedDiagnosticEvent | null,
          ): event is ParsedDiagnosticEvent => Boolean(event),
        );
    }

    if (metaSwitch === 4) {
      const diagnosticEvents = txMeta.v4()?.diagnosticEvents?.() ?? [];
      return diagnosticEvents
        .map((diagnosticEvent: any) =>
          this.normalizeContractEvent(diagnosticEvent?.event?.()),
        )
        .filter(
          (
            event: ParsedDiagnosticEvent | null,
          ): event is ParsedDiagnosticEvent => Boolean(event),
        );
    }

    return [];
  }

  private normalizeContractEvent(
    contractEvent: any,
  ): ParsedDiagnosticEvent | null {
    try {
      const body = contractEvent?.body?.();
      const eventV0 = body?.v0?.();
      const topicScVals = eventV0?.topics?.() ?? [];
      const dataScVal = eventV0?.data?.();

      const topics = topicScVals.map((topic: any) => this.scValToNative(topic));
      const dataNative = dataScVal ? this.scValToNative(dataScVal) : undefined;

      const eventName = this.extractEventName(topics, dataNative);
      if (!eventName) {
        return null;
      }

      const payload =
        dataNative && typeof dataNative === 'object'
          ? (dataNative as Record<string, unknown>)
          : { value: dataNative };

      return { name: eventName, payload };
    } catch {
      return null;
    }
  }

  private extractEventName(
    topics: unknown[],
    payload: unknown,
  ): 'ContributionReceived' | 'RoundCompleted' | null {
    for (const topic of topics) {
      const value = String(topic ?? '').toLowerCase();
      if (value === 'contributionreceived') {
        return 'ContributionReceived';
      }
      if (value === 'roundcompleted') {
        return 'RoundCompleted';
      }
    }

    if (payload && typeof payload === 'object') {
      const payloadObject = payload as Record<string, unknown>;
      const nameCandidate =
        payloadObject.eventName ?? payloadObject.event ?? payloadObject.type;
      const value = String(nameCandidate ?? '').toLowerCase();
      if (value === 'contributionreceived') {
        return 'ContributionReceived';
      }
      if (value === 'roundcompleted') {
        return 'RoundCompleted';
      }
    }

    return null;
  }

  private async handleParsedEvent(
    event: ParsedDiagnosticEvent,
    tx: HorizonTransactionRecord,
  ): Promise<void> {
    if (event.name === 'ContributionReceived') {
      await this.handleContributionReceived(event.payload, tx);
      return;
    }

    if (event.name === 'RoundCompleted') {
      await this.handleRoundCompleted(event.payload);
    }
  }

  private async handleContributionReceived(
    payload: Record<string, unknown>,
    tx: HorizonTransactionRecord,
  ): Promise<void> {
    const groupId = this.readString(payload, ['groupId', 'group_id']);
    const userId = this.readString(payload, ['userId', 'user_id', 'memberId']);
    const walletAddress = this.readString(payload, [
      'walletAddress',
      'wallet_address',
      'memberWallet',
    ]);
    const amount = this.readString(payload, ['amount']);
    const roundNumber =
      this.readNumber(payload, ['roundNumber', 'round_number']) ?? 1;

    if (!groupId || !userId || !walletAddress || !amount) {
      this.logger.warn(
        `Skipping ContributionReceived event from tx ${tx.hash} due to missing fields`,
        EventListenerService.name,
      );
      return;
    }

    const timestamp = tx.created_at ? new Date(tx.created_at) : new Date();
    const existing = await this.contributionRepository.findOne({
      where: { transactionHash: tx.hash },
    });

    if (existing) {
      await this.contributionRepository.update(
        { id: existing.id },
        {
          groupId,
          userId,
          walletAddress,
          amount,
          roundNumber,
          timestamp,
        },
      );
    } else {
      const contribution = this.contributionRepository.create({
        groupId,
        userId,
        walletAddress,
        amount,
        roundNumber,
        transactionHash: tx.hash,
        timestamp,
      });
      await this.contributionRepository.save(contribution);
    }

    await this.membershipRepository.update(
      { groupId, userId },
      { hasPaidCurrentRound: true },
    );
  }

  private async handleRoundCompleted(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const groupId = this.readString(payload, ['groupId', 'group_id']);
    if (!groupId) {
      this.logger.warn(
        'Skipping RoundCompleted event due to missing groupId',
        EventListenerService.name,
      );
      return;
    }

    const payoutUserId = this.readString(payload, [
      'payoutRecipientUserId',
      'payoutUserId',
      'recipientUserId',
      'userId',
      'user_id',
    ]);
    const payoutWallet = this.readString(payload, [
      'payoutRecipientWallet',
      'recipientWallet',
      'walletAddress',
      'wallet_address',
    ]);
    const payoutOrder = this.readNumber(payload, [
      'payoutOrder',
      'payout_order',
    ]);

    await this.groupRepository.increment({ id: groupId }, 'currentRound', 1);
    await this.membershipRepository.update(
      { groupId },
      { hasPaidCurrentRound: false },
    );

    if (payoutUserId) {
      await this.membershipRepository.update(
        { groupId, userId: payoutUserId },
        { hasReceivedPayout: true },
      );
      return;
    }

    if (payoutWallet) {
      await this.membershipRepository.update(
        { groupId, walletAddress: payoutWallet },
        { hasReceivedPayout: true },
      );
      return;
    }

    if (payoutOrder !== undefined) {
      await this.membershipRepository.update(
        { groupId, payoutOrder },
        { hasReceivedPayout: true },
      );
    }
  }

  private readString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private readNumber(
    payload: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private async getLastProcessedLedger(): Promise<number> {
    const raw = await this.redis.get(this.ledgerCheckpointKey);
    if (!raw) {
      return 0;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async setLastProcessedLedger(ledger: number): Promise<void> {
    await this.redis.set(this.ledgerCheckpointKey, String(ledger));
  }

  private scValToNative(value: unknown): unknown {
    return (StellarSdk as any).scValToNative(value);
  }

  private processedTxKey(hash: string): string {
    return `event-listener:processed-tx:${hash}`;
  }

  private async isAlreadyProcessed(hash: string): Promise<boolean> {
    if (!hash) {
      return false;
    }
    const exists = await this.redis.get(this.processedTxKey(hash));
    return exists === '1';
  }

  private async markProcessed(hash: string): Promise<void> {
    if (!hash) {
      return;
    }
    await this.redis.set(this.processedTxKey(hash), '1');
  }
}
