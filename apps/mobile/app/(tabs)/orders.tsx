import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { space } from '../../src/theme';
import { AssetIcon, Badge, Button, Card, Empty, Header, Press, Row, Segmented, Skeleton, Text } from '../../src/ui';

const ACTIVE = new Set(['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED']);
const tone = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'default' : s === 'DISPUTED' ? 'danger' : 'warning') as 'success' | 'default' | 'danger' | 'warning';

export default function Orders() {
  const { colors: c, me } = useApp();
  const { t, money, num, date } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (me) setRows(await api.orders().catch(() => [])); else setRows([]); }, [me]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const shown = (rows ?? []).filter((o) => tab === 'all' || ACTIVE.has(o.status));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={t('nav.orders')} />
      {!me ? <Empty icon="receipt-outline" text={t('errors.UNAUTHORIZED')} action={<Button title={t('nav.login')} onPress={() => router.push('/login')} />} /> : (
        <FlatList data={shown} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: space(4), gap: space(3), paddingTop: space(2) }}
          refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={<View style={{ paddingBottom: space(1) }}><Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: t('ui.active') }, { value: 'all', label: t('ui.all') }]} /></View>}
          ListEmptyComponent={rows === null ? <Skeleton height={90} /> : <Empty icon="receipt-outline" text={t('ui.noData')} action={<Button variant="soft" title={t('ui.exploreMarket')} onPress={() => router.navigate('/')} />} />}
          renderItem={({ item: o }) => (
            <Press onPress={() => router.push(`/orders/${o.id}`)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AssetIcon asset={o.asset} size={38} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text weight="700" tone={o.role === 'buyer' ? 'buy' : 'sell'}>{t(o.role === 'buyer' ? 'market.buyAction' : 'market.sellAction', { asset: o.asset })}</Text>
                  <Text size="tiny" tone="sub">{date(o.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text weight="700">{money(o.fiatAmount, o.fiat)}</Text>
                  <Text size="tiny" tone="sub">{num(o.cryptoAmount)} {o.asset}</Text>
                  <Badge label={t(`order.status.${o.status}`)} tone={tone(o.status)} />
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.sub} />
              </Card>
            </Press>
          )} />
      )}
    </View>
  );
}
