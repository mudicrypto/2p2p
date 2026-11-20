/**
 * Merchant API client: HMAC request signing, Idempotency-Key on every mutation (reused across retries),
 * amounts kept as decimal strings (never floats).
 */
import { createHmac, randomUUID } from 'node:crypto';

export interface MerchantClientOptions { apiUrl: string; keyId: string; secret: string; retries?: number; fetchImpl?: typeof fetch }
export class MerchantApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function sign(secret: string, timestamp: string, method: string, path: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`).digest('hex');
}

export class MerchantClient {
  private retries: number;
  private f: typeof fetch;
  constructor(private o: MerchantClientOptions) { this.retries = o.retries ?? 3; this.f = o.fetchImpl ?? fetch; }

  async request<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, opts: { idempotencyKey?: string } = {}): Promise<T> {
    const raw = body === undefined ? '' : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const idem = method === 'GET' ? undefined : opts.idempotencyKey ?? randomUUID();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ts = String(Date.now()); // fresh signature each attempt (signatures are single-use)
      const headers: Record<string, string> = { accept: 'application/json', 'x-p2p-key': this.o.keyId, 'x-p2p-timestamp': ts, 'x-p2p-signature': sign(this.o.secret, ts, method, path, raw) };
      if (raw) headers['content-type'] = 'application/json';
      if (idem) headers['idempotency-key'] = idem;
      try {
        const res = await this.f(this.o.apiUrl.replace(/\/$/, '') + path, { method, headers, body: raw || undefined });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (res.ok) return data as T;
        const e = new MerchantApiError(res.status, data?.error ?? 'HTTP_ERROR', data?.message ?? res.statusText);
        if (res.status < 500 && res.status !== 429) throw e;
        lastErr = e;
      } catch (e) {
        if (e instanceof MerchantApiError && e.status < 500 && e.status !== 429) throw e;
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    }
    throw lastErr;
  }

  book(q: { side: 'buy' | 'sell'; asset: string; fiat: string; paymentType?: string; limit?: number }) {
    const p = new URLSearchParams({ side: q.side, asset: q.asset, fiat: q.fiat, limit: String(q.limit ?? 100) });
    if (q.paymentType) p.set('paymentType', q.paymentType);
    return this.request<{ items: AdView[]; nextCursor: string | null }>('GET', `/v1/merchant/book?${p}`);
  }
  ads() { return this.request<AdView[]>('GET', '/v1/merchant/ads'); }
  createAd(ad: Record<string, unknown>) { return this.request<AdView>('POST', '/v1/merchant/ads', ad); }
  bulkCreate(ads: Array<Record<string, unknown>>) { return this.request<{ results: Array<{ ok: boolean; ad?: AdView; error?: string; message?: string }> }>('POST', '/v1/merchant/ads/bulk', { ads }); }
  bulkUpdate(ads: Array<{ id: string; status?: string; price?: string; marginBps?: number }>) { return this.request<{ results: Array<{ id: string; ok: boolean; ad?: AdView; error?: string }> }>('PATCH', '/v1/merchant/ads/bulk', { ads }); }
  orders(status?: string[]) { return this.request<OrderView[]>('GET', `/v1/merchant/orders${status?.length ? `?status=${status.join(',')}` : ''}`); }
  order(id: string) { return this.request<OrderView>('GET', `/v1/merchant/orders/${id}`); }
  markPaid(id: string) { return this.request<OrderView>('POST', `/v1/merchant/orders/${id}/paid`, {}); }
  release(id: string) { return this.request<OrderView>('POST', `/v1/merchant/orders/${id}/release`, {}); }
}

export interface AdView { id: string; side: 'buy' | 'sell'; asset: string; fiat: string; priceType: 'fixed' | 'floating'; price: string; status: string; remainingAmount: string; paymentTypes: string[]; [k: string]: unknown }
export interface OrderView { id: string; role: 'buyer' | 'seller'; status: string; cryptoAmount: string; fiatAmount: string; fee: string; referenceCode: string; [k: string]: unknown }
