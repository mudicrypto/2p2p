const API = process.env.API_URL ?? 'http://localhost:4000';
/** Admin panel: separate domain, no framing, strict CSP. */
export default {
  transpilePackages: ['@p2p/ui'],
  poweredByHeader: false,
  async rewrites() { return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }]; },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
};
