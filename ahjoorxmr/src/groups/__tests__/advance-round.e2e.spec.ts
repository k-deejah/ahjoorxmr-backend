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

describe('POST /api/v1/groups/:id/advance-round (e2e)', () => {
  let app: INestApplication;
  let groupRepository;
  let membershipRepository;

  const ADMIN_WALLET = 'GADMIN123';
  const MEMBER1_WALLET = 'GMEMBER1';
  const MEMBER2_WALLET = 'GMEMBER2';

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

  it('should advance round when all members have paid', async () => {
    const group = await groupRepository.save({
      name: 'Test Group',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '100',
      token: 'USDC',
      roundDuration: 30,
      status: GroupStatus.ACTIVE,
      currentRound: 1,
      totalRounds: 5,
      minMembers: 2,
    });

    await membershipRepository.save([
      {
        groupId: group.id,
        userId: 'user-1',
        walletAddress: MEMBER1_WALLET,
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      },
      {
        groupId: group.id,
        userId: 'user-2',
        walletAddress: MEMBER2_WALLET,
        payoutOrder: 2,
        hasPaidCurrentRound: true,
      },
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/advance-round`)
      .set('Authorization', `Bearer mock-jwt-token`)
      .expect(200);

    expect(response.body.currentRound).toBe(2);
    expect(response.body.status).toBe(GroupStatus.ACTIVE);
  });

  it('should return 403 when non-admin tries to advance round', async () => {
    const group = await groupRepository.save({
      name: 'Test Group',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '100',
      token: 'USDC',
      roundDuration: 30,
      status: GroupStatus.ACTIVE,
      currentRound: 1,
      totalRounds: 5,
      minMembers: 2,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/advance-round`)
      .set('Authorization', `Bearer mock-jwt-token-different-user`)
      .expect(403);
  });

  it('should return 400 when not all members have paid', async () => {
    const group = await groupRepository.save({
      name: 'Test Group',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '100',
      token: 'USDC',
      roundDuration: 30,
      status: GroupStatus.ACTIVE,
      currentRound: 1,
      totalRounds: 5,
      minMembers: 2,
    });

    await membershipRepository.save([
      {
        groupId: group.id,
        userId: 'user-1',
        walletAddress: MEMBER1_WALLET,
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      },
      {
        groupId: group.id,
        userId: 'user-2',
        walletAddress: MEMBER2_WALLET,
        payoutOrder: 2,
        hasPaidCurrentRound: false,
      },
    ]);

    await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/advance-round`)
      .set('Authorization', `Bearer mock-jwt-token`)
      .expect(400);
  });
});
