import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { space } from '../../src/theme';
import { AssetIcon, Badge, Button, Card, Empty, PayChip, Row, Skeleton, Text, errText } from '../../src/ui';

export default function MyAds() {
  const { colors: c } = useApp();
  const { t, num } = useI18n();
  const [ads, setAds] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => api.myAds().then((r) => setAds(r.filter((a) => a.status !== 'closed'))).catch(() => setAds([])), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const setStatus = async (id: string, s: 'active' | 'paused' | 'closed') => { setErr(null); try { await api.setAdStatus(id, s); await load(); } catch (e) { setErr(errText(t, e)); } };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), gap: space(3), paddingBottom: space(10) }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Button icon="add" title={t('ui.createAd')} onPress={() => router.push('/ads/new')} />
      {err && <Text tone="sell">{err}</Text>}
      {ads === null && <Skeleton height={140} />}
      {ads?.length === 0 && <Empty icon="megaphone-outline" text={t('ui.noAds')} />}
      {ads?.map((a) => (
        <Card key={a.id} style={{ gap: space(3), opacity: a.status === 'paused' ? 0.8 : 1 }}>
          <Row>
            <AssetIcon asset={a.asset} size={34} />
            <View style={{ flex: 1 }}>
              <Text weight="700" tone={a.side === 'sell' ? 'sell' : 'buy'}>{t(a.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: a.asset })} · {a.fiat}</Text>
              <Text size="h3">{num(a.price, 8)} {a.fiat}</Text>
            </View>
            <Badge label={a.status === 'active' ? t('ui.adActive') : t('ui.paused')} tone={a.status === 'active' ? 'success' : 'warning'} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View><Text size="tiny" tone="sub">{t('market.available')}</Text><Text size="small">{num(a.remainingAmount)} / {num(a.totalAmount)} {a.asset}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text size="tiny" tone="sub">{t('market.limits')}</Text><Text size="small">{num(a.minAmount, 2)} – {num(a.maxAmount, 2)}</Text></View>
          </Row>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>{a.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</Row>
          <Row>
            {a.status === 'active'
              ? <Button size="sm" variant="soft" icon="pause" title={t('ad.pause')} onPress={() => setStatus(a.id, 'paused')} style={{ flex: 1 }} />
              : <Button size="sm" variant="soft" icon="play" title={t('ad.resume')} onPress={() => setStatus(a.id, 'active')} style={{ flex: 1 }} />}
            <Button size="sm" variant="outline" icon="close" title={t('ad.close')} onPress={() => setStatus(a.id, 'closed')} style={{ flex: 1 }} />
          </Row>
        </Card>
      ))}
    </ScrollView>
  );
}
