import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { dir, isLocale, loadMessages } from '@p2p/i18n';
import { Providers } from '../../components/providers';
import { Nav } from '../../components/nav';
import { Footer } from '../../components/footer';

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await loadMessages(locale);
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} dir={dir(locale)} data-theme={theme}>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers locale={locale} messages={messages}>
          <Nav />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
