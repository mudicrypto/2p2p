export { middleware } from '@p2p/web/middleware';
// Must be declared inline: Next reads `config` statically from this file.
export const config = { matcher: ['/((?!v1|_next|favicon.ico|.*\\..*).*)'] };
