'use client';
/** API client: same-origin /v1 (proxied), cookies, CSRF double-submit header, automatic Idempotency-Key. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
const csrf = () => (typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1] ?? ''));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') { headers['x-csrf-token'] = csrf(); headers['idempotency-key'] = opts.idempotencyKey ?? uuid(); }
  const fp = typeof localStorage !== 'undefined' ? safeFingerprint() : undefined;
  if (fp) headers['x-device-fingerprint'] = fp;
  const res = await fetch(`/v1${path}`, { method, headers, credentials: 'include', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'HTTP_ERROR', data?.message ?? res.statusText, data?.details);
  return data as T;
}
function safeFingerprint() {
  try {
    let fp = localStorage.getItem('fp');
    if (!fp) { fp = uuid(); localStorage.setItem('fp', fp); }
    return fp;
  } catch { return undefined; }
}
