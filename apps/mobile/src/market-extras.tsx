/** Trade tab extras (mobile): price bars for the last 24 hours and the first-trade guide. */
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { api } from './native';
import { useApp } from './app';
import { useI18n } from './i18n';
import { Card, Row, Text } from './ui';

export function PriceChart({ asset, fiat, side }: { asset: string; fiat: string; side: 'buy' | 'sell' }) {
  const { colors: c } = useApp();
  const { t, num } = useI18n();
  const [pts, setPts] = useState<Array<{ v: number | null; m: number | null }> | null>(null);
  useEffect(() => {
    setPts(null);
    api.priceHistory(asset, fiat).then((r) => {
      const k = side === 'buy' ? 'bestAsk' : 'bestBid';
      const step = Math.max(1, Math.ceil(r.points.length / 40));
      setPts(r.points.filter((_, i) => i % step === 0).map((p) => ({ v: p[k] === null ? null : Number(p[k]), m: p.market === null ? null : Number(p.market) })));
    }).catch(() => setPts([]));
  }, [asset, fiat, side]);
  if (pts === null) return null;
  const vals = pts.flatMap((p) => [p.v, p.m]).filter((v): v is number => v !== null);
  const last = [...pts].reverse().find((p) => p.v !== null)?.v ?? null;
  const lastM = [...pts].reverse().find((p) => p.m !== null)?.m ?? null;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.01 || 1;
  const premium = last !== null && lastM ? ((last - lastM) / lastM) * 100 : null;
  return (
    <Card style={{ gap: 8 }} testID="price-chart">
      <Row style={{ gap: 6 }}><Ionicons name="trending-up-outline" size={16} color={c.text} /><Text weight="700" style={{ flex: 1 }}>{t('ui.chartTitle', { asset, fiat })}</Text></Row>
      {vals.length < 2 ? <Text size="small" tone="sub">{t('ui.chartEmpty')}</Text> : <>
        <View style={{ height: 70, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {pts.map((p, i) => <View key={i} style={{ flex: 1, height: p.v === null ? 2 : 6 + ((p.v - lo) / span) * 60, borderRadius: 2, backgroundColor: p.v === null ? c.muted : c.primary }} />)}
        </View>
        <Text size="tiny" tone="sub">{t(side === 'buy' ? 'ui.chartBestAsk' : 'ui.chartBestBid')}: {last !== null ? num(String(last), 8) : '—'} · {t('ui.chartMarket')}: {lastM !== null ? num(String(lastM), 8) : '—'}{premium !== null ? ` · ${premium >= 0 ? '+' : ''}${premium.toFixed(2)}%` : ''}</Text>
        <Text size="tiny" tone="sub">{t('ui.chart24h')}</Text>
      </>}
    </Card>
  );
}

const KEY = 'guide.firstTrade.dismissed';
// SecureStore on devices, localStorage on the web build.
const get = async () => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : SecureStore.getItemAsync(KEY));
const set = async (v: string) => { if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, v); else await SecureStore.setItemAsync(KEY, v); };
export function FirstTradeGuide({ show }: { show: boolean }) {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { void get().then((v) => setHidden(v === '1')).catch(() => setHidden(false)); }, []);
  if (!show || hidden) return null;
  return (
    <Card style={{ gap: 8 }} testID="first-trade-guide">
      <Row style={{ justifyContent: 'space-between' }}><Text weight="700">{t('ui.guideTitle')}</Text>
        <Pressable testID="guide-close" accessibilityLabel={t('common.cancel')} onPress={() => { setHidden(true); void set('1').catch(() => null); }}><Ionicons name="close" size={18} color={c.sub} /></Pressable></Row>
      {['ui.guide1', 'ui.guide2', 'ui.guide3', 'ui.guide4'].map((k, i) => (
        <Row key={k} style={{ gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Text size="tiny" weight="700" style={{ color: c.onPrimary }}>{i + 1}</Text></View>
          <Text size="small" style={{ flex: 1 }}>{t(k)}</Text>
        </Row>
      ))}
    </Card>
  );
}
