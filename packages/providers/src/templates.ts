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
};
export function renderTemplate(m: NotifyMessage): string {
  const t = T[m.template] ?? m.template;
  return t.replace(/\{(\w+)\}/g, (_, k) => String(m.params[k] ?? ''));
}
