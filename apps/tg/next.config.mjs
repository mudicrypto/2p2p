const API = process.env.API_URL ?? 'http://localhost:4000';
const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
/** Telegram Mini App: same screens as web, embedded by Telegram clients (so framing by Telegram web is allowed). */
export default {
  transpilePackages: ['@p2p/web', '@p2p/ui', '@p2p/i18n'],
  poweredByHeader: false,
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] }]; },
};
