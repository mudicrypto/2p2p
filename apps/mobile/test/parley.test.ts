import { describe, expect, it } from 'vitest';
import { cdp, orderState, releaseLabel } from '../src/format';

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${JSON.stringify(p)}` : k);

describe('parley display helpers', () => {
  it('shows stablecoins to the cent and other assets to 6 places', () => {
    expect(cdp('USDT')).toBe(2);
    expect(cdp('BTC')).toBe(6);
  });
  it('labels release time honestly, including traders with no history', () => {
    expect(releaseLabel(0, t)).toBe('ui.releaseNew');
    expect(releaseLabel(45, t)).toBe('common.seconds:{"n":45}');
    expect(releaseLabel(150, t)).toBe('common.minutes:{"n":3}');
  });
  it('tells the buyer to pay and the seller to wait while payment is pending', () => {
    const exp = new Date(Date.UTC(2026, 0, 1, 12, 10)).toISOString();
    const now = Date.UTC(2026, 0, 1, 12, 0, 30);
    expect(orderState({ status: 'AWAITING_PAYMENT', role: 'buyer', expiresAt: exp }, t, now)).toEqual({ pill: 'ui.payNow', tone: 'warning', hint: 'ui.minLeftToPay:{"n":10}' });
    expect(orderState({ status: 'AWAITING_PAYMENT', role: 'seller', expiresAt: exp }, t, now).pill).toBe('ui.waitingPayment');
  });
  it('asks the seller to confirm once the buyer has paid, and flags disputes', () => {
    expect(orderState({ status: 'PAID', role: 'seller' }, t).pill).toBe('ui.confirmPayment');
    expect(orderState({ status: 'PAID', role: 'buyer' }, t).pill).toBe('ui.waitingRelease');
    expect(orderState({ status: 'DISPUTED', role: 'buyer' }, t).tone).toBe('danger');
  });
});
