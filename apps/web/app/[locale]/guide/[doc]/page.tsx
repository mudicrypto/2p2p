import { notFound } from 'next/navigation';
import { isLocale } from '@p2p/i18n';
import { GUIDES } from '../../../../lib/guides';

export default async function GuidePage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  const d = GUIDES[doc as keyof typeof GUIDES];
  if (!d || !isLocale(locale)) notFound();
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-10" lang="en" dir="ltr" data-testid="guide">
      <header className="space-y-2 border-b border-border pb-6"><h1 className="text-3xl font-bold tracking-tight">{d.title}</h1>
        <p className="text-xs text-muted-foreground">{d.updated}</p></header>
      {d.sections.map((s) => (
        <section key={s.h} className="space-y-2"><h2 className="text-lg font-semibold">{s.h}</h2>
          <ul className="list-disc space-y-1.5 ps-5">{s.p.map((x, i) => <li key={i} className="text-sm leading-7 text-muted-foreground">{x}</li>)}</ul></section>
      ))}
    </article>
  );
}
