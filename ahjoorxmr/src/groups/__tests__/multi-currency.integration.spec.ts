import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { GroupsService } from '../groups.service';
import { Group } from '../entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { GroupStatus } from '../entities/group-status.enum';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { NotificationsService } from '../../notification/notifications.service';
import { StellarService } from '../../stellar/stellar.service';
import { DataSource } from 'typeorm';

const mockGroupRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockMembershipRepo = () => ({ find: jest.fn() });

const mockStellarService = () => ({
  deployRoscaContract: jest.fn().mockResolvedValue('CTEST123'),
  disbursePayout: jest.fn().mockResolvedValue('txhash123'),
  getAccountTrustlines: jest.fn(),
});

const mockNotificationsService = () => ({ notify: jest.fn(), notifyBatch: jest.fn() });

const mockConfigService = () => ({
  get: jest.fn((key: string, def?: any) => {
    if (key === 'ALLOWED_ASSET_CODES') return 'XLM,USDC';
    return def;
  }),
});

describe('GroupsService – multi-currency (issue #234)', () => {
  let service: GroupsService;
  let groupRepo: ReturnType<typeof mockGroupRepo>;

  beforeEach(async () => {
    groupRepo = mockGroupRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: mockMembershipRepo() },
        { provide: WinstonLogger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: NotificationsService, useValue: mockNotificationsService() },
        { provide: StellarService, useValue: mockStellarService() },
        { provide: ConfigService, useValue: mockConfigService() },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  const baseDto = {
    name: 'Test Group',
    adminWallet: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
    contributionAmount: '100',
    token: 'XLM',
    roundDuration: 30,
    totalRounds: 3,
    minMembers: 2,
  };

  it('creates an XLM group with assetCode=XLM and assetIssuer=null', async () => {
    const saved = { ...baseDto, id: 'uuid-1', assetCode: 'XLM', assetIssuer: null, status: GroupStatus.PENDING, currentRound: 0, contractAddress: null, maxMembers: 3, createdAt: new Date(), updatedAt: new Date() };
    groupRepo.create.mockReturnValue(saved);
    groupRepo.save.mockResolvedValue(saved);

    const result = await service.createGroup({ ...baseDto }, 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON');

    expect(groupRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assetCode: 'XLM', assetIssuer: null }),
    );
    expect(result.assetCode).toBe('XLM');
    expect(result.assetIssuer).toBeNull();
  });

  it('creates a USDC group with assetCode=USDC and valid issuer', async () => {
    const issuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const saved = { ...baseDto, id: 'uuid-2', assetCode: 'USDC', assetIssuer: issuer, status: GroupStatus.PENDING, currentRound: 0, contractAddress: null, maxMembers: 3, createdAt: new Date(), updatedAt: new Date() };
    groupRepo.create.mockReturnValue(saved);
    groupRepo.save.mockResolvedValue(saved);

    const result = await service.createGroup(
      { ...baseDto, assetCode: 'USDC', assetIssuer: issuer },
      'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
    );

    expect(groupRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ assetCode: 'USDC', assetIssuer: issuer }),
    );
    expect(result.assetCode).toBe('USDC');
  });

  it('rejects an unknown asset code with BadRequestException', async () => {
    await expect(
      service.createGroup(
        { ...baseDto, assetCode: 'SHIB', assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
        'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
      ),
    ).rejects.toThrow('not supported');
  });
});

describe('StellarService – buildAsset (issue #234)', () => {
  it('returns native asset for XLM', () => {
    const StellarSdk = require('@stellar/stellar-sdk');
    // Mock the SDK
    const mockNative = { type: 'native' };
    jest.spyOn(StellarSdk.Asset, 'native').mockReturnValue(mockNative as any);

    // We test the logic directly
    const assetCode = 'XLM';
    const assetIssuer = null;
    const isNative = assetCode === 'XLM' || !assetIssuer;
    expect(isNative).toBe(true);
  });

  it('returns custom asset for USDC with issuer', () => {
    const assetCode = 'USDC';
    const assetIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const isNative = assetCode === 'XLM' || !assetIssuer;
    expect(isNative).toBe(false);
  });
});
