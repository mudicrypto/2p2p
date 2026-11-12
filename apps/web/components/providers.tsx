'use client';
import type { Messages } from '@p2p/i18n';
import { I18nProvider } from '../lib/i18n';
import { SessionProvider } from '../lib/session';
export function Providers({ locale, messages, children }: { locale: string; messages: Messages; children: React.ReactNode }) {
  return <I18nProvider locale={locale} messages={messages}><SessionProvider>{children}</SessionProvider></I18nProvider>;
}
