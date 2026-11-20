/** My ads tools (mobile): promote an ad, 30-day stats, shop link, pause/resume all. */
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { api, WEB_URL } from './native';
import { useI18n } from './i18n';
import { Button, Card, Chip, CopyRow, Notice, Row, Text, errText } from './ui';

export function PromotePanel({ ad, onDone }: { ad: any; onDone: () => void }) {
  const { t, date } = useI18n();
  const [price, setPrice] = useState<{ pricePerDayUsdt: string; maxDays: number } | null>(null);
  const [days, setDays] = useState(3);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.features().then((f) => setPrice(f.promotion ?? null)).catch(() => null); }, []);
  const cost = price ? (Number(price.pricePerDayUsdt) * days).toFixed(2).replace(/\.00$/, '') : '…';
  const pay = async () => {
    setBusy(true); setMsg(null);
    try { await api.promote(ad.id, days); setMsg({ ok: true, text: '✓' }); onDone(); } catch (e) { setMsg({ ok: false, text: errText(t, e) }); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 8 }} testID="promote">
      <Text size="small" tone="sub">{t('ui.promoteDesc')}</Text>
      {ad.promotedUntil && new Date(ad.promotedUntil) > new Date() && <Text size="small">{t('ui.promotedUntil', { date: date(ad.promotedUntil) })}</Text>}
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {[1, 3, 7, 14, 30].filter((d) => !price || d <= price.maxDays).map((d) => <Chip key={d} label={`${d} ${t('ui.promoteDays').toLowerCase()}`} active={days === d} onPress={() => setDays(d)} />)}
      </Row>
      <Button title={t('ui.promotePay', { amount: cost })} loading={busy} disabled={!price} onPress={pay} testID="promote-pay" />
      {msg && <Notice tone={msg.ok ? 'success' : 'error'} text={msg.text} />}
    </View>
  );
}

export function MerchantStats() {
  const { t, num } = useI18n();
  const [s, setS] = useState<any>(null);
  useEffect(() => { api.stats(30).then(setS).catch(() => null); }, []);
  if (!s) return null;
  const pct = (bps: number) => `${(bps / 100).toFixed(0)}%`;
  const cells: Array<[string, string]> = [
    [t('ui.statsOrders'), String(s.totals.orders)], [t('ui.statsCompleted'), String(s.totals.completed)],
    [t('ui.completionRate'), pct(s.totals.completionRateBps)], [t('ui.statsVolume'), `$${num(s.totals.usdVolume, 2)}`],
  ];
  return (
    <Card style={{ gap: 10 }} testID="merchant-stats">
      <Text weight="700">{t('ui.statsTitle')}</Text>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {cells.map(([k, v]) => <View key={k} style={{ flexBasis: '47%', flexGrow: 1 }}><Text size="tiny" tone="sub">{k}</Text><Text size="h3">{v}</Text></View>)}
      </Row>
    </Card>
  );
}

export function ShopLink({ me, locale }: { me: any; locale: string }) {
  const { t } = useI18n();
  if (!me) return null;
  const link = `${WEB_URL}/${locale}/m/${encodeURIComponent(me.displayName ?? me.id)}`;
  return (
    <Card style={{ gap: 8 }} testID="shop-link">
      <Text weight="700">{t('ui.shopLink')}</Text>
      <Text size="small" tone="sub">{me.displayName ? t('ui.shopLinkDesc') : t('ui.shopLinkNick')}</Text>
      <CopyRow label="" value={link} />
      <Button size="sm" variant="soft" icon="share-outline" title={t('ui.shopLink')} onPress={() => void Share.share({ message: link }).catch(() => null)} />
    </Card>
  );
}

export function BulkButtons({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  if (ids.length < 2) return null;
  const run = async (action: 'pause' | 'resume') => {
    const r = await api.bulkAds(ids, action).catch(() => null);
    if (!r) return;
    const ok = r.results.filter((x) => x.ok).length;
    setMsg(t('ui.bulkResult', { ok, total: r.results.length })); onDone();
  };
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ gap: 8 }}>
        <Button size="sm" variant="soft" icon="pause" title={`${t('ad.pause')} · ${ids.length}`} onPress={() => run('pause')} style={{ flex: 1 }} testID="bulk-pause" />
        <Button size="sm" variant="soft" icon="play" title={`${t('ad.resume')} · ${ids.length}`} onPress={() => run('resume')} style={{ flex: 1 }} testID="bulk-resume" />
      </Row>
      {msg && <Text size="small" tone="buy" testID="bulk-msg">{msg}</Text>}
    </View>
  );
}
