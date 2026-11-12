import Script from 'next/script';
import { notFound } from 'next/navigation';
import { dir, isLocale, loadMessages } from '@p2p/i18n';
import { Providers } from '@p2p/web/components/providers';
import { TelegramGate } from '../../components/telegram-gate';
import { TgNav } from '../../components/tg-nav';

export default async function TgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await loadMessages(locale);
  return (
    <html lang={locale} dir={dir(locale)} data-theme="dark">
      <head><Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" /></head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers locale={locale} messages={messages}>
          <TelegramGate>
            <main className="mx-auto w-full max-w-xl px-3 pb-24 pt-3">{children}</main>
            <TgNav />
          </TelegramGate>
        </Providers>
      </body>
    </html>
  );
}
