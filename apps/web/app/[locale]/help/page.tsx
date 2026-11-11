'use client';
import Link from 'next/link';
import { Activity, ChevronDown, FileText, Gavel, LifeBuoy, ShieldCheck } from 'lucide-react';
import { Card } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useL } from '../../../components/nav';

const FAQ: Array<[string, string[]]> = [
  ['ui.faqEscrow', ['ui.why1d', 'ui.how1d']],
  ['ui.faqBuy', ['ui.how1d', 'ui.how2d', 'ui.how3d']],
  ['ui.faqSell', ['ui.pmHint', 'order.releaseHint']],
  ['ui.faqDispute', ['ui.disputeHint']],
  ['ui.faqFees', ['ui.hero2']],
  ['ui.faqSafety', ['ui.tip1', 'ui.tip2', 'ui.tip3']],
];

export default function Help() {
  const { t } = useI18n();
  const L = useL();
  const cards: Array<[typeof Activity, string, string, string]> = [
    [Gavel, t('order.dispute'), t('ui.disputeHelp'), '/orders'],
    [Activity, t('launch.statusTitle'), t('ui.statusHelp'), '/status'],
    [ShieldCheck, t('ui.security'), t('ui.twoFaDesc'), '/account'],
    [FileText, t('launch.terms'), t('launch.legalNote'), '/legal/terms'],
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="relative overflow-hidden p-8">
        <div className="hero-glow absolute inset-0" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-primary-foreground"><LifeBuoy size={28} /></span>
          <div><h1 className="text-3xl font-extrabold tracking-tight">{t('ui.help')}</h1><p className="text-muted-foreground">{t('ui.helpSub')}</p></div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([Icon, title, desc, href]) => (
          <Link key={href} href={L(href)} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
            <Icon size={22} className="text-primary" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('ui.faq')}</h2>
        <Card className="divide-y divide-border" data-testid="faq">
          {FAQ.map(([q, as]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">{t(q)}<ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">{as.map((a) => <p key={a}>{t(a)}</p>)}</div>
            </details>
          ))}
        </Card>
      </section>
    </div>
  );
}
