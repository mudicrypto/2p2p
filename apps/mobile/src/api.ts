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
    book: (q: { side: 'buy' | 'sell'; asset: string; fiat: string; amount?: string; paymentType?: string; onlineOnly?: string; followingOnly?: string; merchantOnly?: string; minTier?: string; q?: string }) => call<{ items: any[]; promoted?: any[] }>(`/ads?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
    createOrder: (adId: string, fiatAmount: string, paymentMethodId?: string) => call('/orders', { body: { adId, fiatAmount, paymentMethodId } }),
    order: (id: string) => call(`/orders/${id}`),
    orders: () => call<any[]>('/orders'),
    markPaid: (id: string) => call(`/orders/${id}/paid`, { body: {} }),
    cancel: (id: string) => call(`/orders/${id}/cancel`, { body: {} }),
    release: (id: string, totp: string, payerNameConfirmed?: boolean) => call(`/orders/${id}/release`, { body: { totp, ...(payerNameConfirmed ? { payerNameConfirmed } : {}) } }),
    balances: () => call<Record<string, Record<string, string>>>('/me/balances'),
    registerPush: (token: string, platform: 'ios' | 'android') => call('/push-tokens', { body: { token, platform } }),
    logout: () => call('/auth/logout', { body: {} }),
    signup: (email: string, password: string, country: string, locale: string, ref?: string) => call<{ user: any; devEmailToken?: string }>('/auth/signup', { body: { email, password, country, locale, deviceFingerprint: fingerprint, ...(ref ? { ref } : {}) } }),
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
    updateAd: (id: string, b: Record<string, unknown>) => call<any>(`/ads/${id}`, { method: 'PATCH', body: b }),
    features: () => call<{ chatTranslation?: boolean; telegramAlerts?: boolean; promotion?: { pricePerDayUsdt: string; maxDays: number } }>('/features'),
    receiptChecks: (orderId: string) => call<{ automaticReading: boolean; receipts: Array<{ fileKey: string; flags: string[]; extracted?: Record<string, string> | null }> }>(`/orders/${orderId}/receipt-checks`),
    promote: (adId: string, days: number) => call(`/ads/${adId}/promote`, { body: { days } }),
    stats: (days = 30) => call<any>(`/me/stats?days=${days}`),
    bulkAds: (adIds: string[], action: 'pause' | 'resume' | 'close') => call<{ results: Array<{ adId: string; ok: boolean }> }>('/me/ads/bulk', { body: { adIds, action } }),
    merchantPage: (handle: string) => call<{ profile: any; ads: any[] }>(`/m/${encodeURIComponent(handle)}`),
    priceHistory: (asset: string, fiat: string, hours = 24) => call<{ points: Array<{ at: string; bestAsk: string | null; bestBid: string | null; market: string | null }> }>(`/market/history?asset=${asset}&fiat=${fiat}&hours=${hours}`),
    telegram: () => call<{ available: boolean; linked: boolean; bot: string | null }>('/me/telegram'),
    telegramLink: () => call<{ url: string }>('/me/telegram/link', { body: {} }),
    telegramUnlink: () => call('/me/telegram', { method: 'DELETE' }),
    translate: (orderId: string, messageId: string, target: string) => call<{ text: string }>(`/orders/${orderId}/messages/${messageId}/translate`, { body: { target } }),
    savedSearches: () => call<any[]>('/me/saved-searches'),
    saveSearch: (name: string, params: Record<string, unknown>) => call('/me/saved-searches', { body: { name, params } }),
    deleteSavedSearch: (id: string) => call(`/me/saved-searches/${id}`, { method: 'DELETE' }),
    referralRewards: () => call<{ enabled: boolean; rewardAsset: string; rewardAmount: string; minTradeUsd: string; earned: string; pending: string }>('/me/referral/rewards'),
    setNickname: (displayName: string) => call('/me/nickname', { method: 'PUT', body: { displayName } }),
    setBusinessHours: (hours: { tz: string; start: string; end: string; days: number[] } | null) => call('/me/business-hours', { method: 'PUT', body: { hours } }),
    setAway: (away: boolean) => call('/me/away', { method: 'PUT', body: { away } }),
    setAntiPhishing: (code: string | null) => call('/me/anti-phishing', { method: 'PUT', body: { code } }),
    referral: () => call<{ code: string; invited: number; traded: number }>('/me/referral'),
    relation: (id: string) => call<{ following: boolean; blocked: boolean }>(`/users/${id}/relation`),
    setFollow: (id: string, on: boolean) => call<{ following: boolean; blocked: boolean }>(`/users/${id}/follow`, { method: on ? 'PUT' : 'DELETE' }),
    setBlock: (id: string, on: boolean) => call<{ following: boolean; blocked: boolean }>(`/users/${id}/block`, { method: on ? 'PUT' : 'DELETE' }),
    following: () => call<any[]>('/me/following'),
    blocked: () => call<any[]>('/me/blocked'),
    priceAlerts: () => call<any[]>('/me/price-alerts'),
    addPriceAlert: (b: { side: 'buy' | 'sell'; asset: string; fiat: string; price: string }) => call('/me/price-alerts', { body: b }),
    deletePriceAlert: (id: string) => call(`/me/price-alerts/${id}`, { method: 'DELETE' }),
    otcRequests: () => call<any[]>('/me/otc-requests'),
    createOtc: (b: { side: 'buy' | 'sell'; asset: string; fiat: string; fiatAmount: string; note?: string }) => call('/otc-requests', { body: b }),
    merchantApply: (b: { businessName: string; country: string; expectedMonthlyVolumeUsd: number }) => call('/merchant-program/apply', { body: b }),
  };
}
export type MobileApi = ReturnType<typeof createApi>;
