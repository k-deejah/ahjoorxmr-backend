import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { MembershipsModule } from '../memberships.module';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../entities/membership.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { NotificationsModule } from '../../notification/notifications.module';
import { Notification } from '../../notification/notification.entity';
import { User } from '../../users/entities/user.entity';

describe('POST /api/v1/groups/:id/payout (e2e)', () => {
  let app: INestApplication;
  let groupRepository;
  let membershipRepository;

  const ADMIN_WALLET = 'GADMIN123';
  const MEMBER_WALLET = 'GMEMBER1';
  const USER_ID = 'user-123';

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
          entities: [Group, Membership, Notification, User],
          synchronize: true,
          dropSchema: true,
        }),
        MembershipsModule,
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

  it('should record payout successfully', async () => {
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

    const membership = await membershipRepository.save({
      groupId: group.id,
      userId: USER_ID,
      walletAddress: MEMBER_WALLET,
      payoutOrder: 1,
      hasReceivedPayout: false,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/payout`)
      .set('Authorization', `Bearer mock-jwt-token`)
      .send({
        recipientUserId: USER_ID,
        transactionHash: '0xabcdef1234567890',
      })
      .expect(200);

    expect(response.body.hasReceivedPayout).toBe(true);
  });

  it('should return 409 when member already received payout', async () => {
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

    await membershipRepository.save({
      groupId: group.id,
      userId: USER_ID,
      walletAddress: MEMBER_WALLET,
      payoutOrder: 1,
      hasReceivedPayout: true,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/payout`)
      .set('Authorization', `Bearer mock-jwt-token`)
      .send({
        recipientUserId: USER_ID,
        transactionHash: '0xabcdef1234567890',
      })
      .expect(409);
  });

  it('should return 400 when group is not ACTIVE', async () => {
    const group = await groupRepository.save({
      name: 'Test Group',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '100',
      token: 'USDC',
      roundDuration: 30,
      status: GroupStatus.PENDING,
      currentRound: 0,
      totalRounds: 5,
      minMembers: 2,
    });

    await membershipRepository.save({
      groupId: group.id,
      userId: USER_ID,
      walletAddress: MEMBER_WALLET,
      payoutOrder: 1,
      hasReceivedPayout: false,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/groups/${group.id}/payout`)
      .set('Authorization', `Bearer mock-jwt-token`)
      .send({
        recipientUserId: USER_ID,
        transactionHash: '0xabcdef1234567890',
      })
      .expect(400);
  });
});
