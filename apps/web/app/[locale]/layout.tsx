import { notFound } from 'next/navigation';
import { dir, isLocale, loadMessages } from '@p2p/i18n';
import { Providers } from '../../components/providers';
import { Nav } from '../../components/nav';
import { Footer } from '../../components/footer';

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await loadMessages(locale);
  return (
    <html lang={locale} dir={dir(locale)}>
      <body className="min-h-screen antialiased">
        <Providers locale={locale} messages={messages}>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
