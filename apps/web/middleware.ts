import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, DEFAULT_LOCALE } from '@p2p/i18n';
import { buildCsp, newNonce } from './lib/csp';

/** Locale routing (/{locale}/...) + per-request nonce CSP. */
export function middleware(req: NextRequest, opts: { frameAncestors?: string } = {}) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];
  if (!(LOCALES as readonly string[]).includes(first)) {
    const cookie = req.cookies.get('locale')?.value;
    const accept = req.headers.get('accept-language')?.split(',').map((s) => s.split(';')[0].trim()) ?? [];
    const pick = [cookie, ...accept, ...accept.map((a) => a.split('-')[0])].find((l) => l && (LOCALES as readonly string[]).includes(l)) ?? DEFAULT_LOCALE;
    const url = req.nextUrl.clone();
    url.pathname = `/${pick}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }
  const nonce = newNonce();
  const csp = buildCsp(nonce, { frameAncestors: opts.frameAncestors, dev: process.env.NODE_ENV === 'development' });
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  return res;
}
export const config = { matcher: ['/((?!v1|_next|favicon.ico|.*\\..*).*)'] };
