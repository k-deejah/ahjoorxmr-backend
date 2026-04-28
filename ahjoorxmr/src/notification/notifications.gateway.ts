import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { NotificationsService } from './notifications.service';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: '*' } })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers?.authorization as string | undefined)?.replace(
        /^Bearer /i,
        '',
      );

    if (!raw) {
      client.disconnect(true); // WS 1008 Policy Violation
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; userId?: string }>(raw);
      const userId = payload.userId ?? payload.sub;
      client.data.userId = userId;
      await client.join(`user:${userId}`);
      this.logger.debug(`Socket ${client.id} joined room user:${userId}`);
    } catch {
      client.disconnect(true); // WS 1008 Policy Violation
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket ${client.id} disconnected`);
  }

  /** Called by NotificationsService immediately after persisting a record. */
  emitNotification(userId: string, notification: unknown): void {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  @SubscribeMessage('notification:mark-read')
  async handleMarkRead(
    @MessageBody() data: { id: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const userId: string | undefined = client.data.userId;
    if (!userId) throw new WsException('Unauthorized');

    const updated = await this.notificationsService.markAsRead(data.id, userId);
    this.server.to(`user:${userId}`).emit('notification:updated', updated);
  }
}
