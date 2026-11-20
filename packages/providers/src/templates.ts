import type { NotifyMessage } from './interfaces';
/** Minimal server-side notification templates (en). Clients localize in-app notifications themselves. */
const T: Record<string, string> = {
  otp: 'Your verification code is {code}. It expires in 10 minutes.',
  email_verify: 'Verify your email: {link}',
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
