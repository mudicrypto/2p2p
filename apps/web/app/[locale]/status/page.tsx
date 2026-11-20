'use client';
import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge, Card, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

const VARIANT: Record<string, 'success' | 'warning' | 'danger'> = { operational: 'success', degraded: 'warning', paused: 'warning', outage: 'danger' };
/** Public status page (polls /v1/status). */
export default function Status() {
  const { t, date } = useI18n();
  const [s, setS] = useState<any>(null);
  useEffect(() => { const load = () => api('/status').then(setS).catch(() => setS({ overall: 'outage', components: {} })); load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, []);
  if (!s) return null;
  const Icon = s.overall === 'operational' ? CheckCircle2 : s.overall === 'outage' ? XCircle : AlertTriangle;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className={cn('flex items-center gap-4 p-6', s.overall === 'operational' ? 'border-buy/40 bg-buy/5' : s.overall === 'outage' ? 'border-sell/40 bg-sell/5' : 'border-warn/40 bg-warn/5')}>
        <Icon size={36} className={s.overall === 'operational' ? 'text-buy' : s.overall === 'outage' ? 'text-sell' : 'text-warn'} />
        <div className="flex-1"><h1 className="text-xl font-bold">{t('launch.statusTitle')}</h1>{s.updatedAt && <p className="text-xs text-muted-foreground">{date(s.updatedAt)}</p>}</div>
        <Badge variant={VARIANT[s.overall]} data-testid="status-overall">{t(`launch.${s.overall}`)}</Badge>
      </Card>
      <Card className="divide-y divide-border">
        {Object.entries(s.components ?? {}).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-5 py-4 text-sm"><span className="flex items-center gap-2"><Activity size={15} className="text-muted-foreground" />{t(`launch.${k}`)}</span><Badge variant={VARIANT[v as string]}>{t(`launch.${v}`)}</Badge></div>
        ))}
      </Card>
    </div>
  );
}
