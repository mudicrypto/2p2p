import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { fromScaled, toScaled } from '../src/decimal';
import { space } from '../src/theme';
import { Badge, Button, Card, Input, Notice, Press, Row, Screen, Skeleton, Text, errText, success, type IconName } from '../src/ui';


export default function Merchant() {
  const { colors: c, me } = useApp();
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
  const [showStats, setShowStats] = useState(false);
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
        {tile('megaphone-outline', t('ad.mine'), () => router.push('/ads'))}
        {tile('bar-chart-outline', t('ui.analytics'), () => setShowStats((x) => !x))}
        {tile('settings-outline', t('ui.settings'), () => router.navigate('/account'))}
        {tile('headset-outline', t('ui.support'), () => router.push('/help'))}
      </Row>
      {showStats && profile && <Card style={{ gap: 10 }}>
        <Text weight="700">{t('ui.analytics')}</Text>
        <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('profile.avgRelease')}</Text><Text size="small" weight="600">{t('common.seconds', { n: profile.avgReleaseSec })}</Text></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('profile.disputes')}</Text><Text size="small" weight="600">{pct(profile.disputeRateBps)}</Text></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('profile.trades30d')}</Text><Text size="small" weight="600">{profile.trades30d}</Text></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('profile.feedback')}</Text><Text size="small" weight="600">👍 {profile.positiveFeedback} · 👎 {profile.negativeFeedback}</Text></Row>
      </Card>}
      <Text size="h3">{t('ad.mine')}</Text>
      {ads.filter((a) => a.status !== 'closed').slice(0, 5).map((a) => (
        <Card key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text weight="700" tone={a.side === 'sell' ? 'sell' : 'buy'} style={{ flex: 1 }}>{t(a.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: a.asset })}</Text>
          <Text weight="600">{num(a.price, 8)} {a.fiat}</Text>
          <Badge label={a.status === 'active' ? t('ui.adActive') : t('ui.paused')} tone={a.status === 'active' ? 'success' : 'warning'} />
        </Card>
      ))}
      {ads.length === 0 && <Text tone="sub" size="small" style={{ textAlign: 'center' }}>{t('ui.noAds')}</Text>}
      {!isMerchant && status && <ApplyCard onDone={() => api.merchantStatus().then(setStatus).catch(() => null)} />}
      <Button size="lg" icon="add" title={t('ui.createAd')} onPress={() => router.push('/ads/new')} />
    </Screen>
  );
}

function ApplyCard({ onDone }: { onDone: () => void }) {
  const { colors: c, me } = useApp();
  const { t } = useI18n();
  const [f, setF] = useState({ businessName: '', country: me?.country ?? '', volume: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tierOk = (me?.kycTier ?? 0) >= 2;
  return (
    <Card style={{ gap: 10, borderColor: `${c.primary}55` }}>
      <Text weight="700">{t('ui.merchantTitle')}</Text>
      <Text size="small" tone="sub">{t('ui.merchantDesc')}</Text>
      {!tierOk ? <Notice tone="warn" text={t('errors.TIER_REQUIRED')} /> : <>
        <Input label={t('ui.businessName')} value={f.businessName} onChangeText={(v) => setF({ ...f, businessName: v })} />
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}><Input label={t('auth.country')} autoCapitalize="characters" maxLength={2} value={f.country} onChangeText={(v) => setF({ ...f, country: v.toUpperCase() })} /></View>
          <View style={{ flex: 1 }}><Input label={t('ui.monthlyVolume')} keyboardType="number-pad" value={f.volume} onChangeText={(v) => setF({ ...f, volume: v.replace(/\D/g, '') })} /></View>
        </Row>
        {err && <Notice tone="error" text={err} />}
        <Button variant="outline" title={t('ui.apply')} loading={busy} disabled={f.businessName.length < 2 || f.country.length !== 2} onPress={async () => {
          setBusy(true); setErr(null);
          try { await api.merchantApply({ businessName: f.businessName, country: f.country, expectedMonthlyVolumeUsd: Number(f.volume || '0') }); success(); onDone(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
        }} />
      </>}
    </Card>
  );
}
