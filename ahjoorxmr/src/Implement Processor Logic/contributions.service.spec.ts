import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ContributionsService,
  RecordContributionDto,
} from './contributions.service';
import { Contribution } from '../entities/contribution.entity';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let repo: jest.Mocked<Repository<Contribution>>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Contribution>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        { provide: getRepositoryToken(Contribution), useValue: repo },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
  });

  afterEach(() => jest.clearAllMocks());

  const baseDto: RecordContributionDto = {
    from: '0xfrom',
    to: '0xto',
    amount: '1000',
    transactionHash: '0xhash',
    blockNumber: 100,
    contractAddress: '0xcontract',
    chainId: 1,
  };

  it('creates a new contribution when none exists', async () => {
    repo.findOne.mockResolvedValue(null);
    const created = {
      id: 'new-id',
      ...baseDto,
      status: 'confirmed',
    } as unknown as Contribution;
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);

    const result = await service.recordContributionFromTransfer(baseDto);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionHash: baseDto.transactionHash,
        status: 'confirmed',
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('is idempotent when transaction already processed', async () => {
    const existing = { id: 'existing', ...baseDto } as unknown as Contribution;
    repo.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.transactionHash === baseDto.transactionHash) return existing;
      return null;
    });

    const result = await service.recordContributionFromTransfer(baseDto);

    expect(repo.save).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('updates an existing contribution by contributionId', async () => {
    const existing: Contribution = {
      id: 'contrib-id',
      fromAddress: '0xfrom',
      toAddress: '0xto',
      amount: '1000',
      transactionHash: null,
      blockNumber: null,
      contractAddress: null,
      chainId: null,
      status: 'pending',
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({
      ...existing,
      status: 'confirmed',
    } as Contribution);

    const dto: RecordContributionDto = {
      ...baseDto,
      contributionId: 'contrib-id',
    };
    const result = await service.recordContributionFromTransfer(dto);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        transactionHash: baseDto.transactionHash,
      }),
    );
    expect(result.status).toBe('confirmed');
  });
});
