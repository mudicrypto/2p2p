import './globals.css';
export const metadata = { title: 'P2P Admin', robots: { index: false } };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen antialiased">{children}</body></html>;
}
