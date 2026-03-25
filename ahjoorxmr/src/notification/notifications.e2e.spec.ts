import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationsModule } from '../../src/notifications/notifications.module';
import { Notification } from '../../src/notifications/entities/notification.entity';
import { NotificationType } from '../../src/notifications/enums/notification-type.enum';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

/**
 * E2E tests — we replace TypeORM repo and MailerService with mocks so no
 * real DB or SMTP connection is needed.
 */

const AUTH_USER_ID = 'e2e-user-id';
const OTHER_USER_ID = 'other-user-id';

const makeNotification = (
  overrides: Partial<Notification> = {},
): Notification => ({
  id: 'notif-1',
  userId: AUTH_USER_ID,
  type: NotificationType.ROUND_OPENED,
  title: 'Round Opened',
  body: 'A new round has started.',
  isRead: false,
  metadata: {},
  createdAt: new Date('2024-06-01'),
  ...overrides,
});

describe('Notifications — E2E', () => {
  let app: INestApplication;

  const repoMock = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mailerMock = { sendMail: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(getRepositoryToken(Notification))
      .useValue(repoMock)
      .overrideProvider(MailerService)
      .useValue(mailerMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: AUTH_USER_ID };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ─── GET /api/v1/notifications ─────────────────────────────────────────────

  describe('GET /api/v1/notifications', () => {
    it('returns paginated notifications', async () => {
      const items = [makeNotification()];
      repoMock.findAndCount.mockResolvedValue([items, 1]);

      const { status, body } = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .query({ page: 1, limit: 20 });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(body.data).toHaveLength(1);
    });

    it('applies pagination parameters correctly', async () => {
      repoMock.findAndCount.mockResolvedValue([[], 0]);

      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .query({ page: 3, limit: 5 });

      expect(repoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('rejects invalid query params (limit > 100)', async () => {
      const { status } = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .query({ limit: 999 });

      expect(status).toBe(400);
    });
  });

  // ─── GET /api/v1/notifications/unread-count ────────────────────────────────

  describe('GET /api/v1/notifications/unread-count', () => {
    it('returns unread count', async () => {
      repoMock.count.mockResolvedValue(5);

      const { status, body } = await request(app.getHttpServer()).get(
        '/api/v1/notifications/unread-count',
      );

      expect(status).toBe(200);
      expect(body).toBe(5);
    });
  });

  // ─── PATCH /api/v1/notifications/read-all ─────────────────────────────────

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('marks all notifications as read and returns count', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const { status, body } = await request(app.getHttpServer()).patch(
        '/api/v1/notifications/read-all',
      );

      expect(status).toBe(200);
      expect(body).toEqual({ updated: 3 });
    });
  });

  // ─── PATCH /api/v1/notifications/:id/read ─────────────────────────────────

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('marks a notification as read', async () => {
      const n = makeNotification();
      repoMock.findOne.mockResolvedValue(n);
      repoMock.save.mockResolvedValue({ ...n, isRead: true });

      const { status, body } = await request(app.getHttpServer()).patch(
        `/api/v1/notifications/${n.id}/read`,
      );

      expect(status).toBe(200);
      expect(body.isRead).toBe(true);
    });

    it('returns 404 for unknown notification', async () => {
      repoMock.findOne.mockResolvedValue(null);

      const { status } = await request(app.getHttpServer()).patch(
        '/api/v1/notifications/00000000-0000-0000-0000-000000000000/read',
      );

      expect(status).toBe(404);
    });

    it('returns 403 when notification belongs to another user', async () => {
      repoMock.findOne.mockResolvedValue(
        makeNotification({ userId: OTHER_USER_ID }),
      );

      const { status } = await request(app.getHttpServer()).patch(
        '/api/v1/notifications/notif-1/read',
      );

      expect(status).toBe(403);
    });

    it('returns 400 for non-UUID id', async () => {
      const { status } = await request(app.getHttpServer()).patch(
        '/api/v1/notifications/not-a-uuid/read',
      );

      expect(status).toBe(400);
    });
  });
});
