import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { sendChatMessage, listChat, uploadAttachment, readAttachment, listNotifications, markNotificationsRead, leaveFeedback, publicProfile, type User } from '@p2p/core';
import { ChatMessageSchema } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { Zod } from '../common/zod';
import { RateLimit } from '../common/rate-limit.guard';

const uuid = new Zod(z.string().uuid());
const UploadSchema = z.object({ contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']), dataBase64: z.string().max(14_000_000) });

@Controller('v1')
export class SocialController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Get('orders/:id/messages')
  messages(@CurrentUser() u: User, @Param('id', uuid) id: string, @Query('after') after?: string) {
    return listChat(this.ctx, u, id, after && /^\d+$/.test(after) ? BigInt(after) : undefined);
  }
  @Post('orders/:id/messages') @RateLimit(30)
  send(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(ChatMessageSchema, 'ChatMessage')) b: { body: string; attachmentKey?: string }) {
    return sendChatMessage(this.ctx, u, id, b.body, b.attachmentKey);
  }
  @Post('orders/:id/attachments') @RateLimit(10)
  upload(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(UploadSchema, 'UploadAttachment')) b: z.infer<typeof UploadSchema>) {
    return uploadAttachment(this.ctx, u, id, Buffer.from(b.dataBase64, 'base64'), b.contentType);
  }
  @Get('orders/:id/attachments')
  async download(@CurrentUser() u: User, @Param('id', uuid) id: string, @Query('key') key: string, @Res() res: Response) {
    const f = await readAttachment(this.ctx, u, id, String(key));
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(f.body);
  }
  @Post('orders/:id/feedback')
  feedback(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(z.object({ positive: z.boolean(), comment: z.string().max(500).optional() }), 'Feedback')) b: { positive: boolean; comment?: string }) {
    return leaveFeedback(this.ctx, u, id, b.positive, b.comment);
  }

  @Get('notifications')
  async notifications(@CurrentUser() u: User, @Query('before') before?: string) {
    const rows = await listNotifications(this.ctx.db, u.id, before && /^\d+$/.test(before) ? BigInt(before) : undefined);
    return rows.map((n) => ({ id: n.id.toString(), type: n.type, payload: n.payload, read: !!n.readAt, createdAt: n.createdAt }));
  }
  @Post('notifications/read') @HttpCode(200)
  async read(@CurrentUser() u: User) { await markNotificationsRead(this.ctx.db, u.id); return { ok: true }; }

  @Public() @Get('users/:id/profile')
  profile(@Param('id', uuid) id: string) { return publicProfile(this.ctx, id); }
}
