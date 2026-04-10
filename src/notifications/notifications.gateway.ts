import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';

const USER_ROOM_PREFIX = 'user:';

/** Событие для клиента: явная причина до disconnect (не «непонятная синхронизация»). */
export type NotificationsWsErrorPayload = {
  code: 'no_token' | 'invalid_token' | 'invalid_payload';
  message: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/api/notifications',
  cors: { origin: true, credentials: true },
  /** Меньше ложных обрывов на медленных сетях / фоне вкладки (по умолчанию ~20 c). */
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  private getTokenFromHandshake(client: Socket): string | null {
    const auth = client.handshake.auth?.token as string | undefined;
    if (auth) return auth;
    const query = client.handshake.query?.token as string | undefined;
    if (query) return query;
    const authHeader =
      (client.handshake.headers?.authorization as string) ||
      (client.handshake.headers?.Authorization as string);
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
    return null;
  }

  async handleConnection(client: Socket) {
    const token = this.getTokenFromHandshake(client);
    if (!token) {
      this.logger.warn('Notifications WS: no token, disconnecting');
      const payload: NotificationsWsErrorPayload = {
        code: 'no_token',
        message: 'Требуется токен для уведомлений',
      };
      client.emit('notifications_error', payload);
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = this.jwtService.verify(token);
      if (!payload?.userId) {
        this.logger.warn('Notifications WS: invalid payload');
        const err: NotificationsWsErrorPayload = {
          code: 'invalid_payload',
          message: 'В токене нет идентификатора пользователя',
        };
        client.emit('notifications_error', err);
        client.disconnect(true);
        return;
      }
      userId = String(payload.userId);
    } catch {
      this.logger.warn('Notifications WS: invalid or expired token');
      const err: NotificationsWsErrorPayload = {
        code: 'invalid_token',
        message: 'Токен недействителен или срок действия истёк',
      };
      client.emit('notifications_error', err);
      client.disconnect(true);
      return;
    }

    (client as Socket & { userId?: string }).userId = userId;
    const room = `${USER_ROOM_PREFIX}${userId}`;
    client.join(room);

    let count = 0;
    try {
      const res = await this.notificationsService.getUnreadCount(userId);
      count = res.count;
    } catch (e) {
      this.logger.warn(
        `Notifications WS: getUnreadCount failed for ${userId}, sending count=0`,
        e,
      );
      /** Не оставляем клиент без события — иначе таймаут на стороне клиента часто показывается как «ошибка синхронизации». */
      count = 0;
    }

    /** Прямой emit надёжнее, чем только broadcast в комнату сразу после join. */
    client.emit('unread_count', { count });

    this.logger.log(
      `Notifications WS: client ${client.id} joined room ${room}`,
    );
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
      const roomSockets = this.server.sockets.adapter.rooms.get(room);
      if (!roomSockets || roomSockets.size === 0) {
        this.logger.debug(
          `Notifications WS: room ${room} is empty, skipping unread count update for user ${userId}`,
        );
        return;
      }
      this.server.to(room).emit('unread_count', { count });
      this.logger.debug(
        `Notifications WS: unread count sent to user ${userId}, count: ${count}`,
      );
    } catch (e) {
      this.logger.warn(
        `Notifications WS: emitUnreadCountToUser failed for ${userId}`,
        e,
      );
    }
  }

  /**
   * Событие прогресса (опыт, уровень, достижение, дропы) — для тостов на клиенте.
   */
  emitProgressToUser(
    userId: string,
    event:
      | { type: 'exp_gain'; amount: number; reason: string }
      | {
          type: 'level_up';
          oldLevel: number;
          newLevel: number;
          oldRank: {
            rank: number;
            stars: number;
            name: string;
            minLevel: number;
          };
          newRank: {
            rank: number;
            stars: number;
            name: string;
            minLevel: number;
          };
        }
      | { type: 'achievement'; achievement: Record<string, unknown> }
      | {
          type: 'reading_drops';
          items: {
            itemId: string;
            count: number;
            name?: string;
            icon?: string;
          }[];
        }
      | {
          type: 'reading_card_drops';
          cards: Record<string, unknown>[];
        },
  ): void {
    try {
      const room = `${USER_ROOM_PREFIX}${userId}`;
      const roomSockets = this.server.sockets.adapter.rooms.get(room);
      if (!roomSockets || roomSockets.size === 0) {
        this.logger.debug(
          `Notifications WS: room ${room} is empty, skipping progress event for user ${userId}`,
        );
        return;
      }
      this.server.to(room).emit('progress', event);
      this.logger.debug(
        `Notifications WS: progress event sent to user ${userId}, type: ${event.type}`,
      );
    } catch (e) {
      this.logger.warn(
        `Notifications WS: emitProgressToUser failed for ${userId}`,
        e,
      );
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
      const roomSockets = this.server.sockets.adapter.rooms.get(room);
      if (!roomSockets || roomSockets.size === 0) {
        this.logger.debug(
          `Notifications WS: room ${room} is empty, skipping notification for user ${userId}`,
        );
        return;
      }
      this.server.to(room).emit('notification', notification);
      this.logger.debug(
        `Notifications WS: notification sent to user ${userId}, type: ${notification.type}`,
      );
    } catch (e) {
      this.logger.warn(
        `Notifications WS: emitNotificationToUser failed for ${userId}`,
        e,
      );
    }
  }
}
