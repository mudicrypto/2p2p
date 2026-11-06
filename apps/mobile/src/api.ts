/** Mobile API client: bearer token (kept in SecureStore by the app), Idempotency-Key on every mutation, no floats. */
export class MobileApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function createApi(baseUrl: string, getToken: () => string | null | Promise<string | null>, fingerprint?: string) {
  async function call<T = any>(path: string, opts: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (fingerprint) headers['x-device-fingerprint'] = fingerprint;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['idempotency-key'] = opts.idempotencyKey ?? uuid();
    const res = await fetch(`${baseUrl}/v1${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new MobileApiError(res.status, data?.error ?? 'HTTP_ERROR', data?.message ?? String(res.status));
    return data as T;
  }
  return {
    call,
    login: (email: string, password: string, totp?: string) => call<{ token: string; user: any }>('/auth/login', { body: { email, password, totp, deviceFingerprint: fingerprint } }),
    me: () => call<{ user: any }>('/auth/me'),
    book: (q: { side: 'buy' | 'sell'; asset: string; fiat: string; amount?: string }) => call<{ items: any[] }>(`/ads?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
    createOrder: (adId: string, fiatAmount: string, paymentMethodId?: string) => call('/orders', { body: { adId, fiatAmount, paymentMethodId } }),
    order: (id: string) => call(`/orders/${id}`),
    orders: () => call<any[]>('/orders'),
    markPaid: (id: string) => call(`/orders/${id}/paid`, { body: {} }),
    cancel: (id: string) => call(`/orders/${id}/cancel`, { body: {} }),
    release: (id: string, totp: string) => call(`/orders/${id}/release`, { body: { totp } }),
    balances: () => call<Record<string, Record<string, string>>>('/me/balances'),
    registerPush: (token: string, platform: 'ios' | 'android') => call('/push-tokens', { body: { token, platform } }),
  };
}
export type MobileApi = ReturnType<typeof createApi>;
