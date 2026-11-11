import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { rememberAd } from '../../src/cache';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { getQuotes, valuate, type Quote } from '../../src/market';
import { radius, space } from '../../src/theme';
import { AssetIcon, Avatar, Button, Card, Globe, IconButton, Press, Row, Skeleton, Text, Wordmark, type IconName } from '../../src/ui';

export default function Home() {
  const { colors: c, me } = useApp();
  const { t, money, num, pct } = useI18n();
  const ins = useSafeAreaInsets();
  const [fiat] = useState('USD');
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [bal, setBal] = useState<Record<string, Record<string, string>> | null>(null);
  const [offers, setOffers] = useState<any[] | null>(null);
  const [hide, setHide] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [q, o, b] = await Promise.all([getQuotes(fiat), api.book({ side: 'buy', asset: 'USDT', fiat }).catch(() => ({ items: [] })), me ? api.balances().catch(() => ({})) : Promise.resolve(null)]);
    setQuotes(q); setOffers(o.items.slice(0, 3)); setBal(b);
  }, [fiat, me]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);
  const v = bal ? valuate(bal, quotes) : null;
  const shortcut = (icon: IconName, label: string, to: string) => (
    <Press onPress={() => router.push(to as never)} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={22} color={c.primary} /></View>
      <Text size="tiny" weight="600" style={{ textAlign: 'center' }} numberOfLines={2}>{label}</Text>
    </Press>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: ins.top, paddingBottom: space(10) }}
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <Wordmark size={26} />
        <IconButton icon="notifications-outline" label={t('nav.notifications')} onPress={() => router.push(me ? '/notifications' : '/login')} />
      </Row>
      <View style={{ paddingHorizontal: space(4), gap: space(4) }}>
        {/* Hero / balance */}
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: `${c.primary}55`, backgroundColor: c.card }}>
          <View style={{ position: 'absolute', right: -90, top: -60 }}><Globe size={280} opacity={0.55} /></View>
          <View style={{ padding: space(5), gap: space(2) }}>
            {me ? <>
              <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('ui.totalBalance')}</Text><Press onPress={() => setHide(!hide)}><Ionicons name={hide ? 'eye-off' : 'eye'} size={18} color={c.sub} /></Press></Row>
              {v === null ? <Skeleton height={40} style={{ width: 200 }} /> : <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>{hide ? '••••••' : (v.total === '0' && !v.complete ? '—' : `≈ ${money(v.total, fiat)}`)}</Text>}
              <Text size="tiny" tone="sub">{t('ui.indicativeNote')}</Text>
              <Row style={{ marginTop: space(3), gap: 8 }}>
                <Button title={t('ui.deposit')} onPress={() => router.push('/deposit')} style={{ flex: 1 }} size="sm" />
                <Button variant="outline" title={t('ui.withdraw')} onPress={() => router.push('/withdraw')} style={{ flex: 1 }} size="sm" />
                <Button variant="outline" title={t('ui.trade')} onPress={() => router.navigate('/p2p')} style={{ flex: 1 }} size="sm" />
              </Row>
            </> : <>
              <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36 }}>{t('ui.heroA')}{'\n'}<Text tone="primary" style={{ fontSize: 32, fontWeight: '800' }}>{t('ui.heroB')}</Text></Text>
              <Text size="small" tone="sub" style={{ maxWidth: 260 }}>{t('ui.fastSecureGlobal')}</Text>
              <Row style={{ marginTop: space(3) }}><Button title={t('ui.getStarted')} icon="arrow-forward" onPress={() => router.push('/signup')} style={{ flex: 1 }} /><Button variant="outline" title={t('nav.login')} onPress={() => router.push('/login')} style={{ flex: 1 }} /></Row>
            </>}
          </View>
        </View>

        {/* Ticker */}
        <Card style={{ flexDirection: 'row', paddingVertical: space(3) }}>
          {(quotes ?? [{ asset: 'BTC' }, { asset: 'ETH' }, { asset: 'USDT' }] as Quote[]).map((q) => (
            <Row key={q.asset} style={{ flex: 1, gap: 6 }}><AssetIcon asset={q.asset} size={24} /><View style={{ flexShrink: 1 }}><Text size="tiny" tone="sub" weight="600">{q.asset}</Text><Text size="small" weight="700" numberOfLines={1}>{q.price ? num(q.price, 8) : '—'}</Text></View></Row>
          ))}
        </Card>

        {/* Shortcuts */}
        <Row style={{ alignItems: 'flex-start' }}>
          {shortcut('grid', t('ui.p2pTrade'), '/p2p')}
          {shortcut('storefront', t('ui.merchantCentre'), me ? '/merchant' : '/login')}
          {shortcut('gift', t('ui.rewards'), '/rewards')}
          {shortcut('help-buoy', t('ui.help'), '/help')}
        </Row>

        {/* Offers preview */}
        <Row style={{ justifyContent: 'space-between' }}><Text size="h3">{t('ui.p2pOffers')}</Text><Press onPress={() => router.navigate('/p2p')}><Text tone="primary" weight="700" size="small">{t('ui.viewAll')} →</Text></Press></Row>
        {offers === null ? <Skeleton height={120} /> : offers.length === 0 ? <Text tone="sub" size="small">{t('market.empty')}</Text> : offers.map((ad) => (
          <Press key={ad.id} onPress={() => (me ? router.push({ pathname: '/trade', params: { adId: rememberAd(ad), side: 'buy' } }) : router.push('/login'))}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={36} />
              <View style={{ flex: 1 }}>
                <Text weight="700" numberOfLines={1}>{ad.advertiser.displayName}</Text>
                <Text size="tiny" tone="sub">{pct(ad.advertiser.completionRateBps)} · {num(ad.remainingAmount, 2)} {ad.asset}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}><Text weight="800" tone="buy">{num(ad.price, 8)}</Text><Text size="tiny" tone="sub">{ad.fiat}</Text></View>
            </Card>
          </Press>
        ))}

        {/* Trust */}
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {([['shield-checkmark', 'ui.why1t'], ['checkmark-done-circle', 'ui.why2t'], ['hammer', 'ui.why3t'], ['earth', 'ui.globalCommunity']] as Array<[IconName, string]>).map(([icon, k]) => (
            <Card key={k} style={{ flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: space(3) }}><Ionicons name={icon} size={20} color={c.primary} /><Text size="small" weight="600" style={{ flex: 1 }}>{t(k)}</Text></Card>
          ))}
        </Row>
      </View>
    </ScrollView>
  );
}
