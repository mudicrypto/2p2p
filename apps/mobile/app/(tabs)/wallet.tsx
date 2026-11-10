import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Badge, Button, Card, Divider, Empty, Gradient, Notice, Press, Row, Segmented, Text, errText } from '../../src/ui';

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
  const load = useCallback(async () => {
    if (!me) return;
    const [b, l, d, w] = await Promise.all([api.balances().catch(() => ({})), api.limits().catch(() => null), api.deposits().catch(() => []), api.withdrawals().catch(() => [])]);
    setBal(b); setLimits(l); setRows({ deposits: d, withdrawals: w });
  }, [me]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!me) return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}><Empty icon="wallet-outline" text={t('errors.UNAUTHORIZED')} action={<Button title={t('nav.login')} onPress={() => router.push('/login')} />} /></View>;
  const mask = (v: string) => (hide ? '••••' : v);
  const action = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Press onPress={onPress} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={22} color="#fff" /></View>
      <Text size="tiny" tone="white" weight="600">{label}</Text>
    </Press>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: ins.top + space(2), gap: space(4), paddingBottom: space(10) }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Gradient style={{ borderRadius: 28, padding: space(5), gap: space(4) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text size="small" tone="white" style={{ opacity: 0.85 }}>{t('wallet.available')}</Text>
          <Press onPress={() => setHide(!hide)}><Ionicons name={hide ? 'eye-off' : 'eye'} size={18} color="#fff" /></Press>
        </Row>
        <Row style={{ alignItems: 'flex-end' }}><Text tone="white" style={{ fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>{mask(num(bal.USDT?.available ?? '0'))}</Text><Text tone="white" weight="700" style={{ marginBottom: 8, opacity: 0.85 }}>USDT</Text></Row>
        <Row>{action('arrow-down', t('ui.deposit'), () => router.push('/deposit'))}{action('arrow-up', t('ui.withdraw'), () => router.push('/withdraw'))}{action('swap-horizontal', t('nav.market'), () => router.navigate('/'))}</Row>
      </Gradient>
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
