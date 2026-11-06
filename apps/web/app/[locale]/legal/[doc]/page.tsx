import { notFound } from 'next/navigation';
import { loadMessages, translate, isLocale } from '@p2p/i18n';
import { LEGAL } from '../../../../lib/legal';

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  const d = LEGAL[doc as keyof typeof LEGAL];
  if (!d || !isLocale(locale)) notFound();
  const m = await loadMessages(locale);
  return (
    <article className="prose mx-auto max-w-3xl space-y-4" lang="en" dir="ltr">
      <h1 className="text-2xl font-bold">{d.title}</h1>
      <p className="text-xs text-muted-foreground">{d.updated} · {translate(m, 'launch.legalNote')}</p>
      {d.sections.map((s) => (<section key={s.h} className="space-y-2"><h2 className="text-lg font-semibold">{s.h}</h2>{s.p.map((x, i) => <p key={i} className="text-sm leading-6">{x}</p>)}</section>))}
    </article>
  );
}
