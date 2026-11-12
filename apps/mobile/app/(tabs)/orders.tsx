import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { ACTIVE, cdp, orderState } from '../../src/format';
import { space } from '../../src/theme';
import { Badge, Button, Card, Divider, Empty, Press, Row, Segmented, Skeleton, Text } from '../../src/ui';

export default function Orders() {
  const { colors: c, me } = useApp();
  const { t, money, num, date } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (me) setRows(await api.orders().catch(() => [])); else setRows([]); }, [me]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const active = (rows ?? []).filter((o) => ACTIVE.has(o.status));
  const shown = tab === 'active' ? active : (rows ?? []).filter((o) => !ACTIVE.has(o.status));
  if (!me) return <View style={{ flex: 1, backgroundColor: c.bg }}><Empty icon="receipt-outline" text={t('errors.UNAUTHORIZED')} action={<Button title={t('nav.login')} onPress={() => router.push('/login')} />} /></View>;
  return (
    <FlatList style={{ flex: 1, backgroundColor: c.bg }} data={shown} keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: space(4), paddingTop: space(1), paddingBottom: 120 }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ gap: space(3), paddingBottom: space(3) }}>
        <Text size="h1">{t('ui.ordersNav')}</Text>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: t('ui.activeN', { n: active.length }) }, { value: 'done', label: t('order.status.COMPLETED') }]} />
      </View>}
      ListEmptyComponent={rows === null ? <Skeleton height={90} /> : <Card><Empty icon="receipt-outline" text={t('ui.noData')} action={<Button variant="soft" title={t('ui.trade')} onPress={() => router.navigate('/')} />} /></Card>}
      ListFooterComponent={shown.length ? <Text size="tiny" tone="sub" style={{ paddingHorizontal: space(4), paddingTop: space(3) }}>{t('ui.escrowNote')}</Text> : undefined}
      renderItem={({ item: o, index }) => {
        const st = orderState(o, t);
        const cp = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8) ?? '—';
        return (
          <View style={{ backgroundColor: c.card, borderTopLeftRadius: index === 0 ? 28 : 0, borderTopRightRadius: index === 0 ? 28 : 0, borderBottomLeftRadius: index === shown.length - 1 ? 28 : 0, borderBottomRightRadius: index === shown.length - 1 ? 28 : 0, paddingHorizontal: space(5) }}>
            {index > 0 && <Divider />}
            <Press onPress={() => router.push(`/orders/${o.id}`)} style={{ paddingVertical: space(4) }}>
              <Row style={{ gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text weight="600" numberOfLines={1}>{t(o.role === 'buyer' ? 'ui.buyingX' : 'ui.sellingX', { amount: num(o.cryptoAmount, cdp(o.asset)), asset: o.asset })}</Text>
                  <Text size="tiny" tone="sub" numberOfLines={1}>{st.hint || date(o.createdAt)} · {cp} · {money(o.fiatAmount, o.fiat)}</Text>
                </View>
                <Badge label={st.pill} tone={st.tone} />
              </Row>
            </Press>
          </View>
        );
      }} />
  );
}
