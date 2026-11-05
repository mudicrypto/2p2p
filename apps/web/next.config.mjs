const API = process.env.API_URL ?? 'http://localhost:4000';
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", `connect-src 'self' ${process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'} ws://localhost:4000`,
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');
/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@p2p/ui', '@p2p/i18n'],
  poweredByHeader: false,
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }]; },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
