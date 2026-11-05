import { NextResponse, type NextRequest } from 'next/server';
/** IP allowlist at the edge of the admin app (the API enforces it again). */
export function middleware(req: NextRequest) {
  const list = (process.env.ADMIN_IP_ALLOWLIST ?? '127.0.0.1,::1').split(',').map((s) => s.trim());
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? (req as unknown as { ip?: string }).ip ?? '127.0.0.1').trim().replace(/^::ffff:/, '');
  if (!list.some((e) => e === ip || (e.endsWith('*') && ip.startsWith(e.slice(0, -1))))) return new NextResponse('Forbidden', { status: 403 });
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
