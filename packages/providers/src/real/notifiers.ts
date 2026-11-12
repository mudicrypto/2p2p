import type { Notifier, NotifyMessage } from '../interfaces';
import { httpJson, requireEnv } from './http';
import { renderTemplate } from '../templates';

/** Telegram Bot API notifier. `to` = chat id (tg_id). */
export class TelegramNotifier implements Notifier {
  async send(msg: NotifyMessage) {
    const token = requireEnv('TELEGRAM_BOT_TOKEN');
    const r = await httpJson<{ result: { message_id: number } }>(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: msg.to, text: renderTemplate(msg), disable_web_page_preview: true }),
    });
    return { id: String(r.result.message_id) };
  }
}
/** Postmark transactional email. */
export class PostmarkNotifier implements Notifier {
  async send(msg: NotifyMessage) {
    const r = await httpJson<{ MessageID: string }>('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Postmark-Server-Token': requireEnv('POSTMARK_TOKEN') },
      body: JSON.stringify({ From: process.env.EMAIL_FROM ?? 'no-reply@example.com', To: msg.to, Subject: msg.template, TextBody: renderTemplate(msg) }),
    });
    return { id: r.MessageID };
  }
}
/** Twilio SMS. */
export class TwilioNotifier implements Notifier {
  async send(msg: NotifyMessage) {
    const sid = requireEnv('TWILIO_SID');
    const auth = Buffer.from(`${sid}:${requireEnv('TWILIO_TOKEN')}`).toString('base64');
    const body = new URLSearchParams({ To: msg.to, From: requireEnv('TWILIO_FROM'), Body: renderTemplate(msg) });
    const r = await httpJson<{ sid: string }>(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    return { id: r.sid };
  }
}
/** Routes by channel. */
export class ChannelNotifier implements Notifier {
  constructor(private byChannel: Partial<Record<NotifyMessage['channel'], Notifier>>, private fallback: Notifier) {}
  send(msg: NotifyMessage) {
    return (this.byChannel[msg.channel] ?? this.fallback).send(msg);
  }
}

/** Expo push service (iOS APNs + Android FCM via Expo). `to` = ExponentPushToken[...]. Optional EXPO_ACCESS_TOKEN. */
export class ExpoPushNotifier implements Notifier {
  async send(msg: NotifyMessage) {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const r = await httpJson<{ data: { id?: string; status: string } }>('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers, body: JSON.stringify({ to: msg.to, title: 'P2P Exchange', body: renderTemplate(msg), data: msg.params, sound: 'default' }),
    });
    return { id: r.data.id ?? r.data.status };
  }
}
