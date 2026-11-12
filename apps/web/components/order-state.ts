/** What the user should do next on an order, as a status pill + one-line hint. */
type T = (k: string, p?: Record<string, string | number>) => string;
export function orderState(o: any, t: T, now = Date.now()) {
  const buyer = o.role === 'buyer';
  const mins = o.expiresAt ? Math.max(0, Math.ceil((new Date(o.expiresAt).getTime() - now) / 60000)) : 0;
  switch (o.status) {
    case 'AWAITING_PAYMENT': case 'CREATED':
      return buyer ? { pill: t('ui.payNow'), tone: 'warning' as const, hint: t('ui.minLeftToPay', { n: mins }) } : { pill: t('ui.waitingPayment'), tone: 'default' as const, hint: t('ui.minLeftToPay', { n: mins }) };
    case 'PAID':
      return buyer ? { pill: t('ui.waitingRelease'), tone: 'default' as const, hint: t('ui.youPaid') } : { pill: t('ui.confirmPayment'), tone: 'info' as const, hint: t('ui.buyerHasPaid') };
    case 'DISPUTED': return { pill: t('ui.inDispute'), tone: 'danger' as const, hint: t('ui.fundsFrozen') };
    case 'COMPLETED': return { pill: t('order.status.COMPLETED'), tone: 'success' as const, hint: '' };
    default: return { pill: t(`order.status.${o.status}`), tone: 'default' as const, hint: '' };
  }
}

/** Display decimals for a crypto asset: stablecoins to the cent, others to 6. */
export const cdp = (asset: string) => (asset === 'USDT' || asset === 'USDC' ? 2 : 6);
