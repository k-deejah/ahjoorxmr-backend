import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './notification-type.enum';

const JWT_SECRET = 'test-secret';

const mockNotification = {
  id: 'notif-1',
  userId: 'user-1',
  type: NotificationType.ROUND_OPENED,
  title: 'Test',
  body: 'Body',
  isRead: false,
  metadata: {},
  idempotencyKey: null,
  createdAt: new Date(),
};

const mockNotificationsService = {
  markAsRead: jest.fn().mockResolvedValue({ ...mockNotification, isRead: true }),
};

function makeClient(port: number, token?: string): Socket {
  return io(`http://localhost:${port}/notifications`, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    forceNew: true,
    timeout: 2000,
  });
}

describe('NotificationsGateway', () => {
  let app: INestApplication;
  let gateway: NotificationsGateway;
  let jwtService: JwtService;
  let port: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      providers: [
        NotificationsGateway,
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 3099;
    gateway = module.get(NotificationsGateway);
    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  const sign = (userId: string) => jwtService.sign({ sub: userId, userId });

  it('rejects connection with no token', (done) => {
    const client = makeClient(port);
    const finish = () => { client.close(); done(); };
    client.on('disconnect', finish);
    client.on('connect_error', finish);
  });

  it('rejects connection with an invalid token', (done) => {
    const client = makeClient(port, 'not.a.valid.jwt');
    const finish = () => { client.close(); done(); };
    client.on('disconnect', finish);
    client.on('connect_error', finish);
  });

  it('accepts connection with a valid token', (done) => {
    const client = makeClient(port, sign('user-ok'));
    client.on('connect', () => { client.close(); done(); });
    client.on('connect_error', done);
  });

  it('subscribes socket to user room — receives notification:new', (done) => {
    const client = makeClient(port, sign('user-room'));
    client.on('connect', () => {
      client.on('notification:new', (data) => {
        expect(data.probe).toBe(true);
        client.close();
        done();
      });
      setTimeout(() => gateway.emitNotification('user-room', { probe: true }), 50);
    });
    client.on('connect_error', done);
  });

  it('does not deliver events destined for a different user', (done) => {
    const client = makeClient(port, sign('user-a'));
    let received = false;
    client.on('connect', () => {
      client.on('notification:new', () => { received = true; });
      setTimeout(() => gateway.emitNotification('user-b', { probe: true }), 50);
      setTimeout(() => { expect(received).toBe(false); client.close(); done(); }, 200);
    });
    client.on('connect_error', done);
  });

  it('handles notification:mark-read and broadcasts notification:updated', (done) => {
    const client = makeClient(port, sign('user-1'));
    client.on('connect', () => {
      client.on('notification:updated', (data) => {
        expect(data.isRead).toBe(true);
        expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
        client.close();
        done();
      });
      setTimeout(() => client.emit('notification:mark-read', { id: 'notif-1' }), 50);
    });
    client.on('connect_error', done);
  });

  it('delivers notification:new within 200ms', (done) => {
    const client = makeClient(port, sign('user-latency'));
    client.on('connect', () => {
      const start = Date.now();
      client.on('notification:new', () => {
        expect(Date.now() - start).toBeLessThan(200);
        client.close();
        done();
      });
      setTimeout(() => gateway.emitNotification('user-latency', { id: 'fast' }), 10);
    });
    client.on('connect_error', done);
  });
});
