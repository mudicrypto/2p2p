import type { NextRequest } from 'next/server';
import { middleware as web } from '@p2p/web/middleware';
/** Same locale routing + nonce CSP as web, but embeddable by Telegram web clients. */
export function middleware(req: NextRequest) { return web(req, { frameAncestors: 'https://web.telegram.org https://*.telegram.org' }); }
// Must be declared inline: Next reads `config` statically from this file.
export const config = { matcher: ['/((?!v1|_next|favicon.ico|.*\\..*).*)'] };
