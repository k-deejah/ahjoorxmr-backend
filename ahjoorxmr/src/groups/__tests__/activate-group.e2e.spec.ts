import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { GroupsModule } from '../groups.module';
import { Group } from '../entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { GroupStatus } from '../entities/group-status.enum';
import { NotificationsModule } from '../../notification/notifications.module';
import { Notification } from '../../notification/notification.entity';

describe('POST /api/v1/groups/:id/activate (e2e)', () => {
  let app: INestApplication;
  let groupRepository;
  let membershipRepository;

  const ADMIN_WALLET =
    '123e4567-e89b-12d3-a456-4266141740aa'; /* valid UUID for guard */
  const MEMBER1_WALLET = '123e4567-e89b-12d3-a456-4266141740ab';
  const MEMBER2_WALLET = '123e4567-e89b-12d3-a456-4266141740ac';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_TEST_HOST || 'localhost',
          port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
          username: process.env.DB_TEST_USERNAME || 'postgres',
          password: process.env.DB_TEST_PASSWORD || 'postgres',
          database: process.env.DB_TEST_NAME || 'ahjoorxmr_test',
          entities: [Group, Membership, Notification],
          synchronize: true,
          dropSchema: true,
        }),
        GroupsModule,
        NotificationsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    groupRepository = moduleFixture.get('GroupRepository');
    membershipRepository = moduleFixture.get('MembershipRepository');
  });

  afterAll(async () => {
    await app.close();
  });

  it('activates group and persists contractAddress', async () => {
    const group = await groupRepository.save({
      name: 'Activation Test Group',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '100',
      token: 'USDC',
      roundDuration: 30,
      status: GroupStatus.PENDING,
      currentRound: 0,
      totalRounds: 3,
      minMembers: 2,
    });

    await membershipRepository.save([
      {
        groupId: group.id,
        userId: MEMBER1_WALLET,
        walletAddress: MEMBER1_WALLET,
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      },
      {
        groupId: group.id,
        userId: MEMBER2_WALLET,
        walletAddress: MEMBER2_WALLET,
        payoutOrder: 2,
        hasPaidCurrentRound: true,
      },
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/activate`)
      .set('Authorization', `Bearer ${ADMIN_WALLET}`)
      .expect(200);

    expect(response.body.status).toBe(GroupStatus.ACTIVE);
    expect(response.body.contractAddress).toBeTruthy();

    const reloaded = await groupRepository.findOne({ where: { id: group.id } });
    expect(reloaded.contractAddress).toBeTruthy();
    expect(reloaded.status).toBe(GroupStatus.ACTIVE);
  });
});
