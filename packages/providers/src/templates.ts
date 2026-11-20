import type { NotifyMessage } from './interfaces';
/** Minimal server-side notification templates (en). Clients localize in-app notifications themselves. */
const T: Record<string, string> = {
  otp: 'Your verification code is {code}. It expires in 10 minutes.',
  email_verify: 'Confirm your email address to finish setting up your parley account: {link}',
  email_test: 'This is a test email from the parley admin panel. Email sending works.',
  password_reset: 'Someone asked to reset the password of your parley account. If it was you, choose a new password here (the link works for 1 hour): {link}. If it was not you, ignore this email: your password stays the same.',
  order_created: 'New order {orderId}: {amount} {asset}.',
  order_paid: 'Buyer marked order {orderId} as paid. Check your account before releasing.',
  order_completed: 'Order {orderId} completed.',
  order_cancelled: 'Order {orderId} was cancelled.',
  order_disputed: 'A dispute was opened on order {orderId}.',
  dispute_resolved: 'Dispute on order {orderId} resolved: {decision}. Reason: {reason}',
  withdrawal_status: 'Withdrawal {withdrawalId}: {status}.',
  deposit_credited: 'Deposit of {amount} {asset} credited.',
  security_alert: 'Security change on your account: {what}. If this was not you, contact support.',
  chat_message: 'New message in order {orderId}.',
  release_reminder: 'Reminder: the buyer marked order {orderId} as paid {minutes} minutes ago. Check your account and release, or open an appeal.',
  price_alert: 'Price alert: {side} {asset} reached {price} {fiat} (your target {target}).',
  otc_update: 'Your large-trade request was updated: {status}.',
  referral_reward: 'Invite reward received: {amount} {asset}.',
  tier_changed: 'Your verification level changed to {tier}.',
  tg_linked: 'Telegram alerts are on. You will get your parley notifications here. Send /stop to turn them off.',
  tg_unlinked: 'Telegram alerts are off for this chat.',
  tg_link_invalid: 'This link has expired. Open parley → Account → Telegram alerts to get a new one.',
  tg_link_taken: 'This Telegram account is already linked to another parley account.',
  tg_help: 'This bot sends your parley trade alerts. Link it from parley → Account → Telegram alerts. Send /stop to turn alerts off.',
};
export function renderTemplate(m: NotifyMessage): string {
  const t = T[m.template] ?? m.template;
  return t.replace(/\{(\w+)\}/g, (_, k) => String(m.params[k] ?? ''));
}

/** Email subjects. Anything not listed gets a generic one. */
const SUBJECTS: Record<string, string> = {
  email_verify: 'Confirm your email for parley',
  email_test: 'parley test email',
  password_reset: 'Reset your parley password',
  security_alert: 'Security change on your parley account',
  order_paid: 'Buyer marked your order as paid',
  release_reminder: 'Reminder: an order is waiting for you',
  order_disputed: 'A dispute was opened on your order',
  dispute_resolved: 'Your dispute was resolved',
  price_alert: 'Your parley price alert',
};
const BUTTONS: Record<string, string> = { email_verify: 'Confirm email', password_reset: 'Choose a new password' };
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Subject, plain text and a simple HTML version of an email. A `link` param becomes a button. */
export function renderEmail(m: NotifyMessage): { subject: string; text: string; html: string } {
  const text = renderTemplate(m);
  const subject = SUBJECTS[m.template] ?? 'Update from parley';
  const link = typeof m.params.link === 'string' ? m.params.link : '';
  const bodyText = link ? (T[m.template] ?? m.template).replace(/[:.]?\s*\{link\}\.?/, '.').replace(/\{(\w+)\}/g, (_, k) => String(m.params[k] ?? '')) : text;
  const button = link
    ? `<p style="margin:28px 0"><a href="${esc(link)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(BUTTONS[m.template] ?? 'Open parley')}</a></p><p style="color:#666;font-size:13px">Or copy this link into your browser:<br><a href="${esc(link)}" style="color:#666;word-break:break-all">${esc(link)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111"><div style="max-width:520px;margin:0 auto;padding:32px 20px"><div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin-bottom:24px">parley</div><div style="background:#fff;border-radius:16px;padding:28px"><p style="font-size:16px;line-height:1.5;margin:0">${esc(bodyText)}</p>${button}</div><p style="color:#888;font-size:12px;margin-top:20px">parley will never ask for your password or 2FA codes by email, and never asks you to release crypto before you see the money in your account.</p></div></body></html>`;
  return { subject, text, html };
}
