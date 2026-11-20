/** Shared display helpers for the parley screens (mirror apps/web/components/order-state.ts). */
type T = (k: string, p?: Record<string, string | number>) => string;
export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';

/** Display decimals for a crypto asset: stablecoins to the cent, others to 6. */
export const cdp = (asset: string) => (asset === 'USDT' || asset === 'USDC' ? 2 : 6);

export function releaseLabel(sec: number | null | undefined, t: T) {
  if (!sec) return t('ui.releaseNew');
  if (sec < 60) return t('common.seconds', { n: sec });
  return t('common.minutes', { n: Math.round(sec / 60) });
}

export const ACTIVE = new Set(['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED']);

/** Pill label, tone and one-line hint for an order, from the viewer's side. */
export function orderState(o: { status: string; role: string; expiresAt?: string }, t: T, now = Date.now()): { pill: string; tone: Tone; hint: string } {
  const buyer = o.role === 'buyer';
  switch (o.status) {
    case 'CREATED':
    case 'AWAITING_PAYMENT': {
      const mins = o.expiresAt ? Math.max(0, Math.ceil((new Date(o.expiresAt).getTime() - now) / 60000)) : 0;
      return buyer ? { pill: t('ui.payNow'), tone: 'warning', hint: t('ui.minLeftToPay', { n: mins }) } : { pill: t('ui.waitingPayment'), tone: 'default', hint: t('ui.minLeftToPay', { n: mins }) };
    }
    case 'PAID': return buyer ? { pill: t('ui.waitingRelease'), tone: 'default', hint: t('ui.youPaid') } : { pill: t('ui.confirmPayment'), tone: 'info', hint: t('ui.buyerHasPaid') };
    case 'DISPUTED': return { pill: t('ui.inDispute'), tone: 'danger', hint: t('ui.fundsFrozen') };
    case 'COMPLETED': return { pill: t('order.status.COMPLETED'), tone: 'success', hint: '' };
    default: return { pill: t(`order.status.${o.status}`), tone: 'default', hint: '' };
  }
}
