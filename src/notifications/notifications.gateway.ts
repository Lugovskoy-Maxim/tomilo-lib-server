import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';

const USER_ROOM_PREFIX = 'user:';

@Injectable()
@WebSocketGateway({
  namespace: '/api/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);
    if (!token) {
      this.logger.warn('Notifications WS: no token, disconnecting');
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      });
      if (!payload?.userId) {
        this.logger.warn('Notifications WS: invalid payload');
        client.disconnect(true);
        return;
      }
      userId = String(payload.userId);
    } catch {
      this.logger.warn('Notifications WS: invalid or expired token');
      client.disconnect(true);
      return;
    }

    (client as Socket & { userId?: string }).userId = userId;
    const room = `${USER_ROOM_PREFIX}${userId}`;
    client.join(room);

    try {
      const { count } = await this.notificationsService.getUnreadCount(userId);
      client.emit('unread_count', { count });
    } catch (e) {
      this.logger.warn(`Notifications WS: getUnreadCount failed for ${userId}`, e);
    }

    this.logger.log(`Notifications WS: client ${client.id} joined room ${room}`);
  }

  handleDisconnect(client: Socket) {
    const userId = (client as Socket & { userId?: string }).userId;
    if (userId) {
      this.logger.log(
        `Notifications WS: client ${client.id} (user ${userId}) disconnected`,
      );
    }
  }

  /**
   * Emit current unread count to all sockets of the user (e.g. after create/read/delete).
   */
  async emitUnreadCountToUser(userId: string): Promise<void> {
    try {
      const { count } = await this.notificationsService.getUnreadCount(userId);
      const room = `${USER_ROOM_PREFIX}${userId}`;
      this.server.to(room).emit('unread_count', { count });
    } catch (e) {
      this.logger.warn(`Notifications WS: emitUnreadCountToUser failed for ${userId}`, e);
    }
  }

  /**
   * Событие прогресса (опыт, уровень, достижение) — для тостов на клиенте.
   */
  emitProgressToUser(
    userId: string,
    event:
      | { type: 'exp_gain'; amount: number; reason: string }
      | {
          type: 'level_up';
          oldLevel: number;
          newLevel: number;
          oldRank: { rank: number; stars: number; name: string; minLevel: number };
          newRank: { rank: number; stars: number; name: string; minLevel: number };
        }
      | { type: 'achievement'; achievement: Record<string, unknown> },
  ): void {
    try {
      const room = `${USER_ROOM_PREFIX}${userId}`;
      this.server.to(room).emit('progress', event);
    } catch (e) {
      this.logger.warn(`Notifications WS: emitProgressToUser failed for ${userId}`, e);
    }
  }

  /**
   * Новое уведомление (комментарий, новая глава и т.д.) — клиент может показать тост.
   */
  emitNotificationToUser(
    userId: string,
    notification: {
      _id: string;
      type: string;
      title: string;
      message: string;
      titleId?: string;
      chapterId?: string;
      metadata?: Record<string, unknown>;
    },
  ): void {
    try {
      const room = `${USER_ROOM_PREFIX}${userId}`;
      this.server.to(room).emit('notification', notification);
    } catch (e) {
      this.logger.warn(`Notifications WS: emitNotificationToUser failed for ${userId}`, e);
    }
  }
}
