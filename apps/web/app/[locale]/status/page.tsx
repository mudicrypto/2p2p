'use client';
import { useEffect, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

const VARIANT: Record<string, 'success' | 'warning' | 'danger'> = { operational: 'success', degraded: 'warning', paused: 'warning', outage: 'danger' };
/** Public status page (polls /v1/status). */
export default function Status() {
  const { t, date } = useI18n();
  const [s, setS] = useState<any>(null);
  useEffect(() => { const load = () => api('/status').then(setS).catch(() => setS({ overall: 'outage', components: {} })); load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, []);
  if (!s) return null;
  return (
    <Card className="mx-auto max-w-xl"><CardHeader><CardTitle className="flex items-center justify-between">{t('launch.statusTitle')}<Badge variant={VARIANT[s.overall]} data-testid="status-overall">{t(`launch.${s.overall}`)}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(s.components ?? {}).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{t(`launch.${k}`)}</span><Badge variant={VARIANT[v as string]}>{t(`launch.${v}`)}</Badge></div>)}
        {s.updatedAt && <p className="pt-2 text-xs text-muted-foreground">{date(s.updatedAt)}</p>}
      </CardContent></Card>
  );
}
