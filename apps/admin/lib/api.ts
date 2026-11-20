'use client';
const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)acsrf=([^;]+)/)?.[1] ?? '');
export async function aapi<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') { headers['x-csrf-token'] = csrf(); headers['idempotency-key'] = crypto.randomUUID(); }
  const res = await fetch(`/v1/admin${path}`, { method, headers, credentials: 'include', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const data = (await res.text()) || 'null';
  const j = JSON.parse(data);
  if (!res.ok) throw new Error(j?.message ?? res.statusText);
  return j as T;
}
