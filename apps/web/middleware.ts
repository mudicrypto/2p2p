import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, DEFAULT_LOCALE } from '@p2p/i18n';

/** Locale routing: /{locale}/... ; picks cookie, then Accept-Language. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];
  if ((LOCALES as readonly string[]).includes(first)) return NextResponse.next();
  const cookie = req.cookies.get('locale')?.value;
  const accept = req.headers.get('accept-language')?.split(',').map((s) => s.split(';')[0].trim()) ?? [];
  const pick = [cookie, ...accept, ...accept.map((a) => a.split('-')[0])].find((l) => l && (LOCALES as readonly string[]).includes(l)) ?? DEFAULT_LOCALE;
  const url = req.nextUrl.clone();
  url.pathname = `/${pick}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}
export const config = { matcher: ['/((?!v1|_next|favicon.ico|.*\\..*).*)'] };
