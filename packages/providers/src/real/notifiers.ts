import type { Notifier, NotifyMessage } from '../interfaces';
import { httpJson, requireEnv } from './http';
import { renderEmail, renderTemplate } from '../templates';

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
/** Resend transactional email. The key and sender can come from the environment or be looked up at send time
 *  (admins can paste the key in the admin panel). Without a key the message goes to `fallback`. */
export class ResendNotifier implements Notifier {
  constructor(private settings: () => Promise<{ key?: string; from?: string } | null> = async () => ({ key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }), private fallback?: Notifier) {}
  async send(msg: NotifyMessage) {
    const s = await this.settings();
    if (!s?.key) { if (this.fallback) return this.fallback.send(msg); throw new Error('email is not configured'); }
    return sendResend(s.key, s.from || process.env.EMAIL_FROM || 'parley <no-reply@parley.markets>', msg);
  }
}
export async function sendResend(key: string, from: string, msg: NotifyMessage): Promise<{ id: string }> {
  const e = renderEmail(msg);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctrl.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [msg.to], subject: e.subject, text: e.text, html: e.html }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? 'error'}`);
    return { id: body.id ?? '' };
  } finally { clearTimeout(t); }
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
