import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../entities/group.entity';
import { StellarService } from '../stellar/stellar.service';

export const GROUP_SYNC_QUEUE = 'group-sync';

export const GROUP_SYNC_JOBS = {
  SYNC_GROUP_STATE: 'SYNC_GROUP_STATE',
} as const;

export interface SyncGroupStatePayload {
  groupId: string;
  contractAddress: string;
  chainId: number;
}

@Processor(GROUP_SYNC_QUEUE, {
  concurrency: 3,
})
export class GroupSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GroupSyncProcessor.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,

    private readonly stellarService: StellarService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} [id=${job.id}]`);

    switch (job.name) {
      case GROUP_SYNC_JOBS.SYNC_GROUP_STATE:
        return this.handleSyncGroupState(job as Job<SyncGroupStatePayload>);

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // SYNC_GROUP_STATE
  // ---------------------------------------------------------------------------
  async handleSyncGroupState(job: Job<SyncGroupStatePayload>): Promise<Group> {
    const { groupId, contractAddress, chainId } = job.data;

    this.logger.log(
      `Syncing group state: groupId=${groupId} contract=${contractAddress} chainId=${chainId}`,
    );

    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    // Fetch live on-chain state
    const onChainState =
      await this.stellarService.getGroupState(contractAddress);

    group.status = onChainState.status;
    group.currentRound = onChainState.currentRound;

    const saved = await this.groupRepo.save(group);

    this.logger.log(
      `Group ${groupId} updated: status=${saved.status} currentRound=${saved.currentRound}`,
    );

    return saved;
  }
}
