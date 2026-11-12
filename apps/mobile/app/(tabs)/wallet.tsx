import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { getQuotes, valuate, type Quote } from '../../src/market';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Badge, Big, Button, Card, Divider, Empty, Hero, IconButton, Notice, Pill, Row, Text, errText } from '../../src/ui';
import { fromScaled, toScaled } from '../../src/decimal';

export default function Wallet() {
  const { colors: c, me, testMode } = useApp();
  const { t, num, money } = useI18n();
  const [bal, setBal] = useState<Record<string, Record<string, string>>>({});
  const [limits, setLimits] = useState<{ daily: string; usedToday: string } | null>(null);
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
  if (!me) return <View style={{ flex: 1, backgroundColor: c.bg }}><Empty icon="wallet-outline" text={t('errors.UNAUTHORIZED')} action={<Button title={t('nav.login')} onPress={() => router.push('/login')} />} /></View>;
  const mask = (v: string) => (hide ? '••••' : v);
  const est = valuate(bal, quotes);
  const u = bal.USDT ?? {};
  const total = fromScaled(toScaled(u.available ?? '0') + toScaled(u.escrow ?? '0'), 2);
  const activity = [...rows.deposits.map((r) => ({ ...r, dir: 'in' })), ...rows.withdrawals.map((r) => ({ ...r, dir: 'out' }))]
    .sort((x, y) => new Date(y.createdAt ?? 0).getTime() - new Date(x.createdAt ?? 0).getTime()).slice(0, 10);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: space(1), gap: space(3), paddingBottom: 120 }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between' }}><Text size="h1">{t('ui.walletNav')}</Text><IconButton icon={hide ? 'eye-off-outline' : 'eye-outline'} label="toggle" onPress={() => setHide(!hide)} /></Row>
      <Hero>
        <Text weight="500">{t('ui.totalBalance')}</Text>
        <Big size={80}>{mask(num(total, 2))}</Big>
        <Text weight="600">USDT</Text>
        <Pill label={`${mask(num(u.available ?? '0', 2))} ${t('ui.availableLower')}${est && est.complete && est.total !== '0' ? ` · ≈ ${mask(money(est.total, 'USD'))}` : ''}`} />
        <Row style={{ gap: 8, alignSelf: 'stretch', marginTop: space(3) }}>
          <Button title={t('ui.deposit')} onPress={() => router.push('/deposit')} style={{ flex: 1 }} />
          <Button variant="soft" title={t('ui.withdraw')} onPress={() => router.push('/withdraw')} style={{ flex: 1 }} />
          <Button variant="soft" title={t('ui.transfer')} onPress={() => router.push('/transfer')} style={{ flex: 1 }} />
        </Row>
      </Hero>
      <Row style={{ gap: space(3), alignItems: 'stretch' }}>
        <Card style={{ flex: 1, gap: 4 }}><Text size="small" tone="sub">{t('wallet.available')}</Text><Text size="h2">{mask(num(u.available ?? '0', 2))}</Text><Text size="tiny" tone="sub">{t('ui.readyToTrade')}</Text></Card>
        <Card style={{ flex: 1, gap: 4 }}><Text size="small" tone="sub">{t('ui.inEscrowLabel')}</Text><Text size="h2">{mask(num(u.escrow ?? '0', 2))}</Text><Text size="tiny" tone="sub">{t('ui.lockedInTrades')}</Text></Card>
      </Row>
      {testMode && <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: space(3) }}>
        <Ionicons name="flask" size={18} color={c.warn} /><Text size="small" tone="sub" style={{ flex: 1 }}>{t('ui.testMode')}</Text>
        <Button size="sm" variant="soft" title={t('wallet.faucet')} onPress={async () => { try { await api.faucet(); await load(); } catch (e) { setErr(errText(t, e)); } }} />
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
      <Card style={{ gap: 0 }}>
        <Text size="h3" style={{ marginBottom: space(1) }}>{t('ui.recentActivity')}</Text>
        {activity.length === 0 ? <Text tone="sub" style={{ textAlign: 'center', paddingVertical: space(6) }}>{t('ui.noData')}</Text> : activity.map((r, i) => (
          <View key={r.dir + r.id}>
            {i > 0 && <Divider />}
            <Row style={{ paddingVertical: space(3), gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={r.dir === 'in' ? 'arrow-down' : 'arrow-up'} size={16} color={r.dir === 'in' ? c.buy : c.text} /></View>
              <View style={{ flex: 1 }}><Text weight="600">{r.dir === 'in' ? t('ui.deposit') : t('ui.withdraw')} · {r.network}</Text><Text size="tiny" tone="sub" numberOfLines={1}>{r.txHash ?? r.address}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text weight="700" tone={r.dir === 'in' ? 'buy' : 'default'}>{r.dir === 'in' ? '+' : '−'}{num(r.amount)} {r.asset}</Text><Text size="tiny" tone="sub">{r.status}</Text></View>
            </Row>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
