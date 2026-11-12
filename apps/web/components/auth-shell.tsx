'use client';
/** parley auth layout: hero card ("Trade with people. Protected by escrow." + steps) above the form card. */
import { Wordmark, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';

export function AuthShell({ title, subtitle, children, step = 1, footer }: { title?: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; step?: 1 | 2 | 3; footer?: React.ReactNode }) {
  const { t } = useI18n();
  const steps = [t('ui.stepAccount'), t('ui.stepVerifyId'), t('ui.trade')];
  return (
    <div className="mx-auto w-full max-w-[440px] space-y-3 pt-2">
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card p-7">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="relative">
          <Wordmark size={30} />
          <h1 className="mt-5 text-[32px] font-bold leading-[1.05] sm:text-[40px] tracking-[-0.035em]">{title ?? t('ui.authHero')}</h1>
          {subtitle && <p className="mt-3 text-[15px] text-muted-foreground">{subtitle}</p>}
          <ol className="mt-6 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <li key={s} className={cn('rounded-full border px-3 py-1 text-[13px] font-semibold', i + 1 === step ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground')}>{i + 1} · {s}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="rounded-[28px] border border-border/60 bg-card p-6">{children}</section>
      {footer && <div className="px-2 pt-6 text-center text-[15px]">{footer}</div>}
    </div>
  );
}
