import { notFound } from 'next/navigation';
import { loadMessages, translate, isLocale } from '@p2p/i18n';
import { LEGAL } from '../../../../lib/legal';

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  const d = LEGAL[doc as keyof typeof LEGAL];
  if (!d || !isLocale(locale)) notFound();
  const m = await loadMessages(locale);
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-10" lang="en" dir="ltr">
      <header className="space-y-2 border-b border-border pb-6"><h1 className="text-3xl font-bold tracking-tight">{d.title}</h1>
      <p className="text-xs text-muted-foreground">{d.updated} · {translate(m, 'launch.legalNote')}</p></header>
      {d.sections.map((s) => (<section key={s.h} className="space-y-2"><h2 className="text-lg font-semibold">{s.h}</h2>{s.p.map((x, i) => <p key={i} className="text-sm leading-7 text-muted-foreground">{x}</p>)}</section>))}
    </article>
  );
}
