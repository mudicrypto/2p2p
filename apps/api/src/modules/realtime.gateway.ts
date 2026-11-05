import { Inject, Logger } from '@nestjs/common';
import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { authenticate, type DomainEvent, type EventSink } from '@p2p/core';
import { orders, eq } from '@p2p/db';
import { jsonBigint } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';

/**
 * Socket.IO gateway. Rooms: order:{id} (status, chat, typing), user:{id} (notifications), ads:{asset}:{fiat} (book).
 * Horizontal scaling: the Redis adapter is attached in main.ts so emits fan out across instances.
 */
@WebSocketGateway({ cors: { origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, EventSink {
  @WebSocketServer() server!: Server;
  private log = new Logger('Realtime');
  constructor(@Inject(CTX) private ctx: Ctx) {}

  async handleConnection(s: Socket) {
    const cookie = s.handshake.headers.cookie?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
    const token = (s.handshake.auth?.token as string | undefined) ?? (cookie ? decodeURIComponent(cookie) : undefined);
    const a = token ? await authenticate(this.ctx, token) : null;
    if (a) { s.data.userId = a.user.id; s.join(`user:${a.user.id}`); }
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() s: Socket, @MessageBody() room: string) {
    if (typeof room !== 'string') return { ok: false };
    if (/^ads:[A-Z]+:[A-Z]{3}$/.test(room)) { s.join(room); return { ok: true }; }
    const m = /^order:([0-9a-f-]{36})$/.exec(room);
    if (m && s.data.userId) {
      const [o] = await this.ctx.db.select({ b: orders.buyerId, s: orders.sellerId }).from(orders).where(eq(orders.id, m[1]));
      if (o && (o.b === s.data.userId || o.s === s.data.userId)) { s.join(room); return { ok: true }; }
    }
    return { ok: false };
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() s: Socket, @MessageBody() orderId: string) {
    if (s.rooms.has(`order:${orderId}`)) s.to(`order:${orderId}`).emit('typing', { orderId, userId: s.data.userId });
  }

  publish(e: DomainEvent) {
    if (!this.server) return;
    const payload = JSON.parse(JSON.stringify({ type: e.type, ...e.payload }, jsonBigint));
    if (e.orderId) this.server.to(`order:${e.orderId}`).emit('order', payload);
    for (const u of e.userIds ?? []) this.server.to(`user:${u}`).emit('notification', payload);
    if (e.room) this.server.to(e.room).emit('book', payload);
  }
}
