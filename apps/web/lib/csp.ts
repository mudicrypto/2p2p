/** Strict per-request CSP: nonce + 'strict-dynamic' for scripts (no 'unsafe-inline' scripts). Next applies the nonce to its own scripts. */
export function buildCsp(nonce: string, opts: { frameAncestors?: string; connect?: string; dev?: boolean } = {}) {
  const ws = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind/Next inject styles; styles cannot execute code
    "img-src 'self' data: blob:", `connect-src 'self' ${opts.connect ?? `${ws} ${ws.replace(/^http/, 'ws')}`}`,
    `frame-ancestors ${opts.frameAncestors ?? "'none'"}`, "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
}
export const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
