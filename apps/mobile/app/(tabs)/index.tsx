import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { rememberAd } from '../../src/cache';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Avatar, Button, Card, Chip, Empty, Gradient, IconButton, PayChip, Press, Row, Segmented, Skeleton, Text } from '../../src/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POPULAR = ['EUR', 'USD', 'GBP', 'BRL', 'NGN', 'INR', 'TRY', 'ARS', 'VND', 'IDR', 'PHP', 'KES', 'UAH', 'PLN', 'MXN', 'ZAR'];

export default function Market() {
  const params = useLocalSearchParams<{ fiat?: string; asset?: string }>();
  const { colors: c, me } = useApp();
  const { t, money, num, pct } = useI18n();
  const ins = useSafeAreaInsets();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState(params.asset ?? 'USDT');
  const [fiat, setFiat] = useState(params.fiat ?? 'EUR');
  const [fiats, setFiats] = useState<string[]>(['EUR', 'USD']);
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const r = await api.book({ side, asset, fiat }).catch(() => ({ items: [] }));
    setItems(r.items);
  }, [side, asset, fiat]);
  useEffect(() => { setItems(null); void load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  useEffect(() => { api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null); }, []);
  const open = (ad: any) => { if (!me) return router.push('/login'); router.push({ pathname: '/trade', params: { adId: rememberAd(ad), side } }); };

  const header = (
    <View style={{ gap: space(4), paddingBottom: space(2) }}>
      <Gradient style={{ borderRadius: 24, padding: space(5), gap: 6, overflow: 'hidden' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row><Ionicons name="swap-horizontal" size={20} color="#fff" /><Text tone="white" weight="800">{t('app.name')}</Text></Row>
          <Row style={{ gap: 0 }}><IconButton icon="notifications-outline" label={t('nav.notifications')} onPress={() => router.push(me ? '/notifications' : '/login')} /></Row>
        </Row>
        <Text size="h2" tone="white" style={{ marginTop: 8 }}>{t('ui.hero1')}</Text>
        <Row style={{ marginTop: 6, gap: 6 }}><Ionicons name="shield-checkmark" size={14} color="#fff" /><Text size="small" tone="white" style={{ opacity: 0.9 }}>{t('ui.why1t')} · {t('ui.statTakerFee')} 0%</Text></Row>
      </Gradient>
      <Segmented value={side} onChange={setSide} options={[{ value: 'buy', label: t('market.buy') }, { value: 'sell', label: t('market.sell') }]} colors={{ buy: c.buy, sell: c.sell }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {ASSETS.map((a) => <Chip key={a} label={a} active={asset === a} onPress={() => setAsset(a)} left={<AssetIcon asset={a} size={18} />} />)}
        <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 4 }} />
        {[...POPULAR.filter((f) => fiats.includes(f)), ...fiats.filter((f) => !POPULAR.includes(f))].slice(0, 16).map((f) => <Chip key={f} label={f} active={fiat === f} onPress={() => setFiat(f)} />)}
      </ScrollView>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: space(4), gap: space(3), paddingBottom: space(10) }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={items === null ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={150} />)}</View> : <Empty icon="search-outline" text={t('market.empty')} />}
        renderItem={({ item: ad }) => (
          <Press onPress={() => open(ad)} testID="ad-row">
            <Card style={{ gap: space(3) }}>
              <Row>
                <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={36} online />
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 4 }}><Text weight="700">{ad.advertiser.displayName}</Text>{ad.advertiser.verifiedBadge && <Ionicons name="checkmark-circle" size={15} color={c.primary} />}</Row>
                  <Text size="tiny" tone="sub">{t('market.trades', { count: ad.advertiser.trades30d })} · {pct(ad.advertiser.completionRateBps)} · {t('common.minutes', { n: ad.paymentWindowMin })}</Text>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ gap: 2 }}>
                  <Text size="tiny" tone="sub">{t('market.price')}</Text>
                  <Text size="h2">{money(ad.price, ad.fiat)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text size="small" weight="600">{num(ad.remainingAmount, 6)} {ad.asset}</Text>
                  <Text size="tiny" tone="sub">{money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</Text>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ flex: 1, flexWrap: 'wrap', gap: 6 }}>{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</Row>
                <Button size="sm" variant={side} title={t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })} onPress={() => open(ad)} />
              </Row>
            </Card>
          </Press>
        )}
      />
    </View>
  );
}
