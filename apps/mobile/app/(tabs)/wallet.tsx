import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { getQuotes, valuate, type Quote } from '../../src/market';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Badge, Button, Card, Divider, Empty, Notice, Press, Row, Segmented, Text, errText } from '../../src/ui';

export default function Wallet() {
  const { colors: c, me, testMode } = useApp();
  const { t, num, money } = useI18n();
  const ins = useSafeAreaInsets();
  const [bal, setBal] = useState<Record<string, Record<string, string>>>({});
  const [limits, setLimits] = useState<{ daily: string; usedToday: string } | null>(null);
  const [hist, setHist] = useState<'deposits' | 'withdrawals'>('deposits');
  const [rows, setRows] = useState<{ deposits: any[]; withdrawals: any[] }>({ deposits: [], withdrawals: [] });
  const [hide, setHide] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const load = useCallback(async () => {
    if (!me) return;
    void getQuotes('USD').then(setQuotes);
    const [b, l, d, w] = await Promise.all([api.balances().catch(() => ({})), api.limits().catch(() => null), api.deposits().catch(() => []), api.withdrawals().catch(() => [])]);
    setBal(b); setLimits(l); setRows({ deposits: d, withdrawals: w });
  }, [me]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!me) return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}><Empty icon="wallet-outline" text={t('errors.UNAUTHORIZED')} action={<Button title={t('nav.login')} onPress={() => router.push('/login')} />} /></View>;
  const mask = (v: string) => (hide ? '••••' : v);
  const est = valuate(bal, quotes);
  const action = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Press onPress={onPress} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.muted, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={21} color={c.text} /></View>
      <Text size="tiny" weight="600">{label}</Text>
    </Press>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: ins.top + space(2), gap: space(4), paddingBottom: space(10) }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between' }}><Text size="h2">{t('nav.wallet')}</Text><Press onPress={() => router.push('/help')}><Ionicons name="headset-outline" size={22} color={c.text} /></Press></Row>
      <View style={{ borderRadius: 24, padding: space(5), gap: space(1), backgroundColor: c.card, borderWidth: 1, borderColor: `${c.primary}55`, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -60, top: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: `${c.primary}22` }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text size="small" tone="sub">{t('ui.totalBalance')}</Text>
          <Press onPress={() => setHide(!hide)}><Ionicons name={hide ? 'eye-off' : 'eye'} size={18} color={c.sub} /></Press>
        </Row>
        <Text style={{ fontSize: 36, fontWeight: '800', letterSpacing: -1 }}>{est && !(est.total === '0' && !est.complete) ? mask(`≈ ${money(est.total, 'USD')}`) : '—'}</Text>
        <Text size="tiny" tone="sub">{mask(num(bal.USDT?.available ?? '0'))} USDT · {t('ui.indicativeNote')}</Text>
        <Row style={{ marginTop: space(4) }}>{action('arrow-down', t('ui.deposit'), () => router.push('/deposit'))}{action('arrow-up', t('ui.withdraw'), () => router.push('/withdraw'))}{action('swap-horizontal', t('ui.transfer'), () => router.push('/transfer'))}{action('time-outline', t('ui.history'), () => setHist('deposits'))}</Row>
      </View>
      {testMode && <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderStyle: 'dashed', borderColor: c.warn }}>
        <Ionicons name="flask" size={18} color={c.warn} /><Text size="small" tone="sub" style={{ flex: 1 }}>{t('ui.testMode')}</Text>
        <Button size="sm" variant="outline" title={t('wallet.faucet')} onPress={async () => { try { await api.faucet(); await load(); } catch (e) { setErr(errText(t, e)); } }} />
      </Card>}
      {err && <Notice tone="error" text={err} />}
      <Card style={{ padding: 0 }}>
        {ASSETS.map((a, i) => (
          <View key={a}>
            {i > 0 && <Divider />}
            <Row style={{ padding: space(4), gap: 12 }}>
              <AssetIcon asset={a} size={38} />
              <View style={{ flex: 1 }}><Text weight="700">{a}</Text><Text size="tiny" tone="sub">{t('wallet.escrow')}: {mask(num(bal[a]?.escrow ?? '0'))}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text weight="700">{mask(num(bal[a]?.available ?? '0'))}</Text><Text size="tiny" tone="sub">{t('wallet.available')}</Text></View>
            </Row>
          </View>
        ))}
      </Card>
      {limits && <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}><Text weight="700">{t('wallet.limits')}</Text><Badge label={t('profile.tier', { tier: me.kycTier })} tone="info" /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('wallet.usedToday')}</Text><Text size="small">{money(limits.usedToday, 'USD')} / {money(limits.daily, 'USD')}</Text></Row>
      </Card>}
      <Text size="h3">{t('ui.history')}</Text>
      <Segmented value={hist} onChange={setHist} options={[{ value: 'deposits', label: t('ui.deposit') }, { value: 'withdrawals', label: t('ui.withdraw') }]} />
      {rows[hist].length === 0 ? <Empty icon="time-outline" text={t('ui.noData')} /> : rows[hist].map((r) => (
        <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AssetIcon asset={r.asset} size={30} />
          <View style={{ flex: 1 }}><Text weight="700">{hist === 'deposits' ? '+' : '−'}{num(r.amount)} {r.asset}</Text><Text size="tiny" tone="sub" numberOfLines={1}>{r.network} · {r.txHash ?? r.address}</Text></View>
          <Badge label={r.status} tone={['credited', 'completed', 'broadcast'].includes(r.status) ? 'success' : ['rejected', 'failed'].includes(r.status) ? 'danger' : 'warning'} />
        </Card>
      ))}
    </ScrollView>
  );
}
