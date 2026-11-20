import './globals.css';
import { headers } from 'next/headers';
export const metadata = { title: 'P2P Admin', robots: { index: false } };
// Render every request: the middleware sets a fresh CSP nonce per request and Next adds it to its scripts.
// A prerendered (static) page has no nonce, so the strict CSP would block all of its scripts.
export const dynamic = 'force-dynamic';
export default async function Root({ children }: { children: React.ReactNode }) {
  await headers();
  return <html lang="en" data-theme="dark"><body className="min-h-screen bg-background text-foreground antialiased">{children}</body></html>;
}
