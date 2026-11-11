import { useCallback, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { fromScaled, toScaled } from '../src/decimal';
import { space } from '../src/theme';
import { Badge, Button, Card, Press, Row, Screen, Skeleton, Text, type IconName } from '../src/ui';

const WEB = 'https://app.example.com'; // TODO(provider): production web origin

export default function Merchant() {
  const { colors: c, me, locale } = useApp();
  const { t, money, pct, num } = useI18n();
  const [status, setStatus] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [ads, setAds] = useState<any[]>([]);
  useFocusEffect(useCallback(() => {
    if (!me) return;
    api.call('/merchant-program/status').then(setStatus).catch(() => setStatus({ status: 'none' }));
    api.profile(me.id).then(setProfile).catch(() => null);
    api.orders().then(setOrders).catch(() => setOrders([]));
    api.call<any[]>('/me/ads').then(setAds).catch(() => null);
  }, [me]));
  const stats = useMemo(() => {
    const done = (orders ?? []).filter((o) => o.status === 'COMPLETED');
    const vol: Record<string, bigint> = {};
    for (const o of done) vol[o.fiat] = (vol[o.fiat] ?? 0n) + toScaled(o.fiatAmount);
    const top = Object.entries(vol).sort((a, b) => (b[1] > a[1] ? 1 : -1))[0];
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d.getTime(); });
    const perDay = days.map((d) => done.filter((o) => { const x = new Date(o.createdAt).getTime(); return x >= d && x < d + 864e5; }).length);
    return { done: done.length, top: top ? { fiat: top[0], amount: fromScaled(top[1], 2) } : null, perDay };
  }, [orders]);
  const max = Math.max(1, ...stats.perDay);
  const isMerchant = status && status.status !== 'none';
  const tile = (icon: IconName, label: string, onPress: () => void) => (
    <Press onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={22} color={c.text} /></View>
      <Text size="tiny" weight="600">{label}</Text>
    </Press>
  );
  const web = (path: string) => void Linking.openURL(`${WEB}/${locale}${path}`);
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text size="h2">{t('ui.merchantCentre')}</Text>
        {isMerchant && <View style={{ backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text size="tiny" weight="800" tone="onPrimary">{status.verifiedBadge ? t('profile.merchant') : status.status}</Text></View>}
      </Row>
      <Card style={{ gap: 4 }}>
        <Text size="small" tone="sub">{t('ui.performance')}</Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>{profile ? <Text style={{ fontSize: 36, fontWeight: '800' }}>{pct(profile.completionRateBps)}</Text> : <Skeleton height={40} style={{ width: 120 }} />}<Text size="small" tone="sub">{t('profile.completion')}</Text></View>
          <Row style={{ alignItems: 'flex-end', gap: 5 }}>{stats.perDay.map((n, i) => <View key={i} style={{ width: 10, height: 10 + (n / max) * 46, borderRadius: 3, backgroundColor: c.buy }} />)}</Row>
        </Row>
      </Card>
      <Row style={{ gap: 12 }}>
        <Card style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 22, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>{stats.top ? money(stats.top.amount, stats.top.fiat) : '—'}</Text><Text size="tiny" tone="sub">{t('ui.tradingVolume')}</Text></Card>
        <Card style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{orders ? num(String(stats.done)) : '—'}</Text><Text size="tiny" tone="sub">{t('ui.completedOrders')}</Text></Card>
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        {tile('megaphone-outline', t('ad.mine'), () => web('/ads'))}
        {tile('bar-chart-outline', t('ui.analytics'), () => web('/merchant'))}
        {tile('settings-outline', t('ui.settings'), () => router.navigate('/account'))}
        {tile('headset-outline', t('ui.support'), () => router.push('/help'))}
      </Row>
      <Text size="h3">{t('ad.mine')}</Text>
      {ads.filter((a) => a.status !== 'closed').slice(0, 5).map((a) => (
        <Card key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text weight="700" tone={a.side === 'sell' ? 'sell' : 'buy'} style={{ flex: 1 }}>{t(a.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: a.asset })}</Text>
          <Text weight="600">{num(a.price, 8)} {a.fiat}</Text>
          <Badge label={a.status === 'active' ? t('ui.adActive') : t('ui.paused')} tone={a.status === 'active' ? 'success' : 'warning'} />
        </Card>
      ))}
      {ads.length === 0 && <Text tone="sub" size="small" style={{ textAlign: 'center' }}>{t('ui.noAds')}</Text>}
      {!isMerchant && status && <Card style={{ gap: 6, borderColor: `${c.primary}55` }}><Text weight="700">{t('ui.merchantTitle')}</Text><Text size="small" tone="sub">{t('ui.merchantDesc')}</Text><Button variant="outline" size="sm" title={t('ui.apply')} onPress={() => web('/merchant')} /></Card>}
      <Button size="lg" icon="add" title={t('ui.createAd')} onPress={() => web('/ads/new')} />
    </Screen>
  );
}
