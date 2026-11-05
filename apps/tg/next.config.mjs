const API = process.env.API_URL ?? 'http://localhost:4000';
const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
/** Telegram Mini App: same screens as web, embedded by Telegram clients (so framing by Telegram web is allowed). */
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' https://telegram.org" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", `connect-src 'self' ${WS} ws://localhost:4000`,
  "frame-ancestors https://web.telegram.org https://*.telegram.org", "base-uri 'self'", "form-action 'self'",
].join('; ');
export default {
  transpilePackages: ['@p2p/web', '@p2p/ui', '@p2p/i18n'],
  poweredByHeader: false,
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] }]; },
};
