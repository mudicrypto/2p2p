import { describe, it, expect } from 'vitest';
import { parseDeepLink, routeForNotification, routeToPath } from '../src/deeplink';
import { initialLock, onAppState, onUnlock, requiresBiometric } from '../src/lock';

const ID = '3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f';
describe('deep links', () => {
  it('parses custom scheme, universal links (with locale) and rejects others', () => {
    expect(parseDeepLink(`p2p://orders/${ID}`)).toEqual({ screen: 'order', id: ID });
    expect(parseDeepLink(`https://app.example.com/pt/orders/${ID}`)).toEqual({ screen: 'order', id: ID });
    expect(parseDeepLink('p2p://market?asset=USDT&fiat=BRL')).toEqual({ screen: 'market', asset: 'USDT', fiat: 'BRL' });
    expect(parseDeepLink(`https://evil.example.org/orders/${ID}`)).toEqual({ screen: 'unknown' });
    expect(parseDeepLink('p2p://orders/not-a-uuid')).toEqual({ screen: 'unknown' });
    expect(routeToPath(routeForNotification({ orderId: ID }))).toBe(`/orders/${ID}`);
  });
});
describe('biometric lock', () => {
  it('locks on cold start and after the grace period in background', () => {
    let s = initialLock();
    expect(s.locked).toBe(true);
    s = onUnlock(s);
    s = onAppState(s, 'background', 0); s = onAppState(s, 'active', 30_000);
    expect(s.locked).toBe(false);
    s = onAppState(s, 'background', 100_000); s = onAppState(s, 'active', 200_000);
    expect(s.locked).toBe(true);
    expect(requiresBiometric('release')).toBe(true);
  });
});
