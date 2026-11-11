import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { dir, isLocale, loadMessages } from '@p2p/i18n';
import { Providers } from '../../components/providers';
import { Shell } from '../../components/nav';
import { Footer } from '../../components/footer';

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await loadMessages(locale);
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} dir={dir(locale)} data-theme={theme}>
      <body className="min-h-screen antialiased">
        <Providers locale={locale} messages={messages}>
          <Shell footer={<Footer />}>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
