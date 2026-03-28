import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Contribution } from '../src/contributions/entities/contribution.entity';
import { Group } from '../src/groups/entities/group.entity';
import { User } from '../src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { GroupStatus } from '../src/groups/entities/group-status.enum';

describe('Contribution Concurrency (e2e)', () => {
  let app: INestApplication;
  let contributionRepository: Repository<Contribution>;
  let groupRepository: Repository<Group>;
  let userRepository: Repository<User>;

  // Use a fixed set of IDs for the test
  const testGroupId = '00000000-0000-0000-0000-000000000001';
  const testUserId = '00000000-0000-0000-0000-000000000002';
  const testWallet = 'GBTTESTCONCURRENCYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    contributionRepository = moduleFixture.get<Repository<Contribution>>(
      getRepositoryToken(Contribution),
    );
    groupRepository = moduleFixture.get<Repository<Group>>(
      getRepositoryToken(Group),
    );
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Clean up and prepare test data
    // Note: In some environments, this might fail if DB is not writable/present.
    // We assume a test database is available as per standard NestJS e2e patterns.
    try {
      await contributionRepository.delete({ groupId: testGroupId });
      await groupRepository.delete({ id: testGroupId });
      await userRepository.delete({ id: testUserId });

      await userRepository.save({
        id: testUserId,
        walletAddress: testWallet,
        isActive: true,
      });

      await groupRepository.save({
        id: testGroupId,
        name: 'Concurrency Test Group',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 10,
        contributionAmount: '100',
        token: 'XLM',
        roundDuration: 3600,
        minMembers: 2,
        maxMembers: 10,
        adminWallet: testWallet,
      });
    } catch (err) {
      console.warn('Could not prepare DB for concurrency test. Ensure DB is running.', err.message);
    }
  });

  afterAll(async () => {
    try {
      await contributionRepository.delete({ groupId: testGroupId });
      await groupRepository.delete({ id: testGroupId });
      await userRepository.delete({ id: testUserId });
    } catch (err) {
      // Ignore cleanup errors
    }
    await app.close();
  });

  it('should only allow one contribution out of 50 concurrent requests', async () => {
    const concurrentRequests = 50;
    const roundNumber = 1;
    
    // Preparation: create 50 unique transaction hashes
    const requests = Array.from({ length: concurrentRequests }).map((_, i) => {
      return request(app.getHttpServer())
        .post('/internal/contributions')
        .set('x-api-key', process.env.INTERNAL_API_KEY || 'test-api-key')
        // We might need to bypass auth guards if they are not configured for e2e
        // For this test, we assume the environment is configured or guards are bypassed in test
        .send({
          groupId: testGroupId,
          userId: testUserId,
          walletAddress: testWallet,
          roundNumber: roundNumber,
          amount: '100',
          transactionHash: `tx-hash-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
        });
    });

    // Execute 50 requests concurrently
    const responses = await Promise.all(requests);

    // Analyze results
    const created = responses.filter((res) => res.status === HttpStatus.CREATED);
    const conflicted = responses.filter((res) => res.status === HttpStatus.CONFLICT);
    
    // We expect exactly one to succeed
    expect(created.length).toBe(1);
    
    // Others should have failed with Conflict (409)
    // Note: Some might fail with 429 if Throttler is active, but the Race Condition
    // check is specifically about DB uniqueness.
    expect(conflicted.length).toBeGreaterThanOrEqual(concurrentRequests - 1 - (responses.filter(r => r.status === 429).length));

    // Verify database state: exactly one record exists for this user/group/round
    const count = await contributionRepository.count({
      where: {
        groupId: testGroupId,
        userId: testUserId,
        roundNumber: roundNumber,
      },
    });

    expect(count).toBe(1);
  }, 30000); // 30s timeout for load test
});
