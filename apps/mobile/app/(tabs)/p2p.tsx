import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { rememberAd } from '../../src/cache';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { REGION_KEYS, typesForRegion } from '../../src/regions';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Avatar, Button, Card, Chip, Empty, IconButton, PayChip, PickerChip, Press, Row, Segmented, Skeleton, Text, Wordmark } from '../../src/ui';

const POPULAR = ['USD', 'EUR', 'GBP', 'NGN', 'BRL', 'INR', 'TRY', 'ARS', 'VND', 'IDR', 'PHP', 'KES', 'UAH', 'PLN', 'MXN', 'ZAR'];

export default function P2P() {
  const params = useLocalSearchParams<{ fiat?: string; asset?: string }>();
  const { colors: c, me } = useApp();
  const { t, num, pct } = useI18n();
  const ins = useSafeAreaInsets();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState(params.asset ?? 'USDT');
  const [fiat, setFiat] = useState(params.fiat ?? 'USD');
  const [pm, setPm] = useState('');
  const [region, setRegion] = useState('');
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [types, setTypes] = useState<Array<{ code: string; name: string; countries?: string[] }>>([]);
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0); // ignore out-of-order responses when filters change quickly
  const load = useCallback(async () => {
    const my = ++seq.current;
    const r = await api.book({ side, asset, fiat, ...(pm ? { paymentType: pm } : {}) }).catch(() => ({ items: [] }));
    if (my === seq.current) setItems(r.items);
  }, [side, asset, fiat, pm]);
  useEffect(() => { setItems(null); void load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  useEffect(() => { api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null); }, []);
  useEffect(() => { api.paymentMethodTypes(fiat).then(setTypes as never).catch(() => setTypes([])); }, [fiat]);
  const regionTypes = useMemo(() => typesForRegion(types, region), [types, region]);
  const shown = (items ?? []).filter((ad) => !regionTypes || ad.paymentTypes.some((p: string) => regionTypes.has(p)));
  const open = (ad: any) => { if (!me) return router.push('/login'); router.push({ pathname: '/trade', params: { adId: rememberAd(ad), side } }); };
  const fiatOptions = [...POPULAR.filter((f) => fiats.includes(f)), ...fiats.filter((f) => !POPULAR.includes(f))].map((f) => ({ value: f, label: f }));

  const header = (
    <View style={{ gap: space(3), paddingBottom: space(1) }}>
      <Segmented value={side} onChange={setSide} options={[{ value: 'buy', label: t('market.buy') }, { value: 'sell', label: t('market.sell') }]} colors={{ buy: c.primary, sell: c.sell }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {ASSETS.map((a) => <Chip key={a} label={a} active={asset === a} onPress={() => setAsset(a)} left={<AssetIcon asset={a} size={18} />} />)}
      </ScrollView>
      <Row style={{ gap: 8 }}>
        <PickerChip fixed label={fiat} value={fiat} options={fiatOptions} onChange={(v) => { setFiat(v); setPm(''); }} title={t('market.fiat')} />
        <PickerChip label={pm ? types.find((x) => x.code === pm)?.name ?? pm : t('ui.allMethods')} value={pm} options={[{ value: '', label: t('ui.allMethods') }, ...types.map((x) => ({ value: x.code, label: x.name }))]} onChange={setPm} title={t('market.paymentMethod')} />
        <PickerChip label={region ? t(`ui.region_${region}`) : t('ui.allRegions')} value={region} options={[{ value: '', label: t('ui.allRegions') }, ...REGION_KEYS.map((r) => ({ value: r, label: t(`ui.region_${r}`) }))]} onChange={setRegion} title={t('ui.regions')} />
      </Row>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <View style={{ width: 40 }} />
        <Wordmark size={24} />
        <IconButton icon="notifications-outline" label={t('nav.notifications')} onPress={() => router.push(me ? '/notifications' : '/login')} />
      </Row>
      <FlatList
        data={shown}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: space(4), paddingTop: space(1), gap: space(3), paddingBottom: space(10) }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={items === null ? <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={130} />)}</View> : <Empty icon="search-outline" text={t('market.empty')} />}
        renderItem={({ item: ad }) => (
          <Press onPress={() => open(ad)} testID="ad-row">
            <Card style={{ gap: space(2.5) }}>
              <Row>
                <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={38} online />
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 4 }}><Text weight="700" numberOfLines={1}>{ad.advertiser.displayName}</Text>{ad.advertiser.verifiedBadge && <Ionicons name="checkmark-circle" size={15} color={c.info} />}</Row>
                  <Text size="tiny" tone="sub">{pct(ad.advertiser.completionRateBps)} · {t('ui.orders', { count: ad.advertiser.trades30d })}</Text>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Row style={{ gap: 4, alignItems: 'flex-end' }}><Text size="h2" tone="buy">{num(ad.price, 8)}</Text><Text size="small" tone="sub" style={{ marginBottom: 3 }}>{ad.fiat}/{ad.asset}</Text></Row>
                  <Text size="tiny" tone="sub">{t('market.available')}: {num(ad.remainingAmount, 6)} {ad.asset}</Text>
                  <Text size="tiny" tone="sub">{t('market.limits')}: {num(ad.minAmount, 2)} – {num(ad.maxAmount, 2)} {ad.fiat}</Text>
                </View>
                <Button size="sm" variant={side === 'buy' ? 'primary' : 'sell'} title={t(side === 'buy' ? 'market.buy' : 'market.sell')} onPress={() => open(ad)} style={{ minWidth: 76 }} />
              </Row>
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</Row>
            </Card>
          </Press>
        )}
      />
    </View>
  );
}
