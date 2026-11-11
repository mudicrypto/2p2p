'use client';
import { BadgeCheck, Lock, Zap } from 'lucide-react';
import { Wordmark } from '@p2p/ui';
import { Globe } from './globe';
import { useI18n } from '../lib/i18n';

/** Split auth layout: brand panel (desktop) + form card. */
export function AuthShell({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card lg:grid-cols-2">
      <div className="relative hidden min-h-[600px] flex-col justify-between overflow-hidden bg-[#07080a] p-10 text-white lg:flex">
        <div className="hero-glow pointer-events-none absolute inset-0 opacity-90" />
        
        <Globe className="pointer-events-none absolute -bottom-48 -end-40 h-[560px] w-[560px] opacity-80" />
        <div className="relative"><Wordmark size={32} className="[&>span:last-child]:text-white" /></div>
        <div className="relative space-y-5">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">{t('ui.heroA')}<br /><span className="text-gradient">{t('ui.heroB')}</span></h2>
          <p className="text-sm text-white/70">{t('ui.authSub')}</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Lock size={15} /></span>{t('ui.why1t')}</li>
            <li className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><BadgeCheck size={15} /></span>{t('ui.why2t')}</li>
            <li className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Zap size={15} /></span>{t('ui.why3t')}</li>
          </ul>
        </div>
        <div className="relative text-xs text-white/50">© {new Date().getFullYear()} {t('app.name')}</div>
      </div>
      <div className="p-6 sm:p-10">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
