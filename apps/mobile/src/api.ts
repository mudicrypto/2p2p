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
    book: (q: { side: 'buy' | 'sell'; asset: string; fiat: string; amount?: string; paymentType?: string }) => call<{ items: any[] }>(`/ads?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
    createOrder: (adId: string, fiatAmount: string, paymentMethodId?: string) => call('/orders', { body: { adId, fiatAmount, paymentMethodId } }),
    order: (id: string) => call(`/orders/${id}`),
    orders: () => call<any[]>('/orders'),
    markPaid: (id: string) => call(`/orders/${id}/paid`, { body: {} }),
    cancel: (id: string) => call(`/orders/${id}/cancel`, { body: {} }),
    release: (id: string, totp: string) => call(`/orders/${id}/release`, { body: { totp } }),
    balances: () => call<Record<string, Record<string, string>>>('/me/balances'),
    registerPush: (token: string, platform: 'ios' | 'android') => call('/push-tokens', { body: { token, platform } }),
    logout: () => call('/auth/logout', { body: {} }),
    signup: (email: string, password: string, country: string, locale: string) => call<{ user: any; devEmailToken?: string }>('/auth/signup', { body: { email, password, country, locale, deviceFingerprint: fingerprint } }),
    verifyEmail: (token: string) => call('/auth/verify-email', { body: { token } }),
    status: () => call<{ overall: string; testMode?: boolean }>('/status'),
    fiats: () => call<Array<{ code: string }>>('/fiats'),
    paymentMethodTypes: (fiat?: string) => call<Array<{ code: string; name: string; fieldsSchema?: Array<{ name: string }> }>>(`/payment-method-types${fiat ? `?fiat=${fiat}` : ''}`),
    paymentMethods: () => call<any[]>('/payment-methods'),
    addPaymentMethod: (b: { type: string; holderName: string; details: Record<string, string> }) => call('/payment-methods', { body: b }),
    messages: (orderId: string) => call<any[]>(`/orders/${orderId}/messages`),
    sendMessage: (orderId: string, body: string, attachmentKey?: string) => call(`/orders/${orderId}/messages`, { body: { body, attachmentKey } }),
    uploadAttachment: (orderId: string, contentType: string, dataBase64: string) => call<{ key: string }>(`/orders/${orderId}/attachments`, { body: { contentType, dataBase64 } }),
    feedback: (orderId: string, positive: boolean) => call(`/orders/${orderId}/feedback`, { body: { positive } }),
    limits: () => call<{ daily: string; usedToday: string }>('/me/limits'),
    depositAddress: (asset: string, network: string) => call<{ address: string; memo?: string | null }>(`/wallet/deposit-address?asset=${asset}&network=${network}`),
    deposits: () => call<any[]>('/wallet/deposits'),
    withdrawals: () => call<any[]>('/wallet/withdrawals'),
    addresses: () => call<any[]>('/wallet/addresses'),
    addAddress: (b: { asset: string; network: string; address: string; label?: string; totp: string }) => call('/wallet/addresses', { body: b }),
    withdraw: (b: { asset: string; network: string; address: string; amount: string; totp: string }) => call('/wallet/withdrawals', { body: b }),
    kycStatus: () => call<{ tier: number; applications: any[] }>('/kyc/status'),
    kycStart: (level: number) => call<{ providerRef: string; url?: string }>('/kyc/start', { body: { level } }),
    devKycApprove: (providerRef: string) => call('/dev/kyc/approve', { body: { providerRef, fullName: 'Test User', status: 'approved' } }),
    faucet: (asset = 'USDT', amount = '1000') => call('/dev/faucet', { body: { asset, amount } }),
    notifications: () => call<any[]>('/notifications'),
    profile: (id: string) => call<any>(`/users/${id}/profile`),
    ad: (id: string) => call<any>(`/ads/${id}`),
    myAds: () => call<any[]>('/me/ads'),
    createAd: (b: Record<string, unknown>) => call<any>('/ads', { body: b }),
    setAdStatus: (id: string, status: 'active' | 'paused' | 'closed') => call<any>(`/ads/${id}`, { method: 'PATCH', body: { status } }),
    totpSetup: () => call<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { body: {} }),
    totpConfirm: (code: string) => call('/auth/2fa/confirm', { body: { code } }),
    changePassword: (oldPassword: string, newPassword: string, totp?: string) => call('/auth/password', { body: { oldPassword, newPassword, totp } }),
    phoneStart: (phone: string) => call<{ sent: boolean; devCode?: string }>('/auth/phone/start', { body: { phone } }),
    phoneVerify: (phone: string, code: string) => call<{ user: any }>('/auth/phone/verify', { body: { phone, code } }),
    transfer: (b: { asset: string; toUserId: string; amount: string; totp: string }) => call('/wallet/transfers', { body: b }),
    dispute: (orderId: string) => call<any>(`/orders/${orderId}/dispute`),
    openDispute: (orderId: string, b: { reason: string; note: string; evidenceKeys: string[] }) => call<any>(`/orders/${orderId}/dispute`, { body: b }),
    addEvidence: (disputeId: string, fileKey: string, note?: string) => call(`/disputes/${disputeId}/evidence`, { body: { fileKey, note } }),
    merchantStatus: () => call<any>('/merchant-program/status'),
    merchantApply: (b: { businessName: string; country: string; expectedMonthlyVolumeUsd: number }) => call('/merchant-program/apply', { body: b }),
  };
}
export type MobileApi = ReturnType<typeof createApi>;
