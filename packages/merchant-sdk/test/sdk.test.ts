import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { MerchantClient, MerchantApiError, sign, AutoPricer, dec, fmt } from '../src';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function fakeFetch(responses: Array<{ status: number; body: unknown }>, calls: Call[]) {
  let i = 0;
  return (async (url: string, init: any) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.status < 400, status: r.status, statusText: String(r.status), text: async () => JSON.stringify(r.body) };
  }) as unknown as typeof fetch;
}

describe('MerchantClient', () => {
  it('signs timestamp\\nMETHOD\\npath\\nbody with HMAC-SHA256', async () => {
    const calls: Call[] = [];
    const c = new MerchantClient({ apiUrl: 'http://api.test/', keyId: 'k1', secret: 's3cret', fetchImpl: fakeFetch([{ status: 200, body: { ok: 1 } }], calls) });
    await c.createAd({ side: 'sell', amount: 10n });
    const h = calls[0].headers;
    expect(calls[0].url).toBe('http://api.test/v1/merchant/ads');
    expect(calls[0].body).toBe('{"side":"sell","amount":"10"}'); // bigint-safe, no floats
    const expected = createHmac('sha256', 's3cret').update(`${h['x-p2p-timestamp']}\nPOST\n/v1/merchant/ads\n${calls[0].body}`).digest('hex');
    expect(h['x-p2p-signature']).toBe(expected);
    expect(sign('s3cret', h['x-p2p-timestamp'], 'post', '/v1/merchant/ads', calls[0].body!)).toBe(expected);
    expect(h['x-p2p-key']).toBe('k1');
    expect(h['idempotency-key']).toMatch(/[0-9a-f-]{36}/);
  });

  it('retries 5xx with the same Idempotency-Key and a fresh signature; never retries 4xx', async () => {
    const calls: Call[] = [];
    const c = new MerchantClient({ apiUrl: 'http://api.test', keyId: 'k', secret: 's', retries: 2, fetchImpl: fakeFetch([{ status: 503, body: {} }, { status: 200, body: { id: 'o1' } }], calls) });
    await c.release('o1');
    expect(calls).toHaveLength(2);
    expect(calls[0].headers['idempotency-key']).toBe(calls[1].headers['idempotency-key']);
    const calls2: Call[] = [];
    const c2 = new MerchantClient({ apiUrl: 'http://api.test', keyId: 'k', secret: 's', fetchImpl: fakeFetch([{ status: 403, body: { error: 'FORBIDDEN', message: 'scope' } }], calls2) });
    await expect(c2.release('o1')).rejects.toBeInstanceOf(MerchantApiError);
    expect(calls2).toHaveLength(1);
  });
});

describe('AutoPricer', () => {
  function stubClient(mine: any[], book: any[]) {
    const updates: any[] = [];
    return {
      updates,
      client: { ads: async () => mine, book: async () => ({ items: book }), bulkUpdate: async (u: any[]) => { updates.push(...u); return { results: u.map((x) => ({ id: x.id, ok: true })) }; } } as any,
    };
  }
  it('undercuts the cheapest competing seller, ignoring my own ads', async () => {
    const s = stubClient([{ id: 'mine', side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.95', status: 'active' }],
      [{ id: 'mine', price: '0.90' }, { id: 'c1', price: '0.93' }, { id: 'c2', price: '0.94' }]);
    const r = await new AutoPricer(s.client, { stepBps: 10, places: 4 }).runOnce();
    expect(r).toEqual([{ adId: 'mine', from: '0.95', to: '0.9291' }]);
  });
  it('clamps to the floor/ceiling around the reference and is idempotent', async () => {
    const s = stubClient([{ id: 'b', side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.90', status: 'active' }], [{ id: 'c', price: '2.00' }]);
    const r = await new AutoPricer(s.client, { reference: async () => '1.00', ceilBps: 300, places: 4 }).runOnce();
    expect(r[0].to).toBe('1.03'); // a 2.00 competitor cannot drag us above ref +3%
    const again = stubClient([{ id: 'b', side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1.03', status: 'active' }], [{ id: 'c', price: '2.00' }]);
    expect(await new AutoPricer(again.client, { reference: async () => '1.00', ceilBps: 300, places: 4 }).runOnce()).toEqual([]);
    expect(again.updates).toEqual([]);
  });
  it('decimal helpers round-trip without floats', () => {
    expect(fmt(dec('0.92905'), 4)).toBe('0.9291');
    expect(fmt(dec('12345678901234567890.5'), 1)).toBe('12345678901234567890.5');
  });
});
