import { NextResponse, type NextRequest } from 'next/server';
/** IP allowlist at the edge of the admin app (the API enforces it again). */
export function middleware(req: NextRequest) {
  const list = (process.env.ADMIN_IP_ALLOWLIST ?? '127.0.0.1,::1').split(',').map((s) => s.trim());
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? (req as unknown as { ip?: string }).ip ?? '127.0.0.1').trim().replace(/^::ffff:/, '');
  if (!list.some((e) => e === ip || (e.endsWith('*') && ip.startsWith(e.slice(0, -1))))) return new NextResponse('Forbidden', { status: 403 });
  // Strict nonce CSP (no inline scripts), no framing at all.
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce); headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  return res;
}
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
