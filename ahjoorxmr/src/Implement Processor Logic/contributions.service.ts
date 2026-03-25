import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contribution } from '../entities/contribution.entity';

export interface RecordContributionDto {
  from: string;
  to: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  chainId: number;
  contributionId?: string;
}

@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);

  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
  ) {}

  async recordContributionFromTransfer(
    dto: RecordContributionDto,
  ): Promise<Contribution> {
    const {
      from,
      to,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
      contributionId,
    } = dto;

    // 1. If a specific contributionId was provided, update the existing record
    if (contributionId) {
      const existing = await this.contributionRepo.findOne({
        where: { id: contributionId },
      });
      if (existing) {
        existing.status = 'confirmed';
        existing.transactionHash = transactionHash;
        existing.blockNumber = blockNumber;
        existing.confirmedAt = new Date();
        const updated = await this.contributionRepo.save(existing);
        this.logger.log(`Updated contribution ${contributionId} to confirmed`);
        return updated;
      }
    }

    // 2. Check idempotency by transactionHash
    const byTxHash = await this.contributionRepo.findOne({
      where: { transactionHash },
    });
    if (byTxHash) {
      this.logger.log(
        `Contribution for tx=${transactionHash} already exists (id=${byTxHash.id})`,
      );
      return byTxHash;
    }

    // 3. Create a new contribution record
    const contribution = this.contributionRepo.create({
      fromAddress: from,
      toAddress: to,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    const saved = await this.contributionRepo.save(contribution);
    this.logger.log(
      `Created new contribution id=${saved.id} for tx=${transactionHash}`,
    );
    return saved;
  }
}
