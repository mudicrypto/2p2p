import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/native';
import { rememberAd } from '../../src/cache';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { space } from '../../src/theme';
import { AssetIcon, Avatar, Badge, Button, Card, Divider, Empty, PayChip, Row, Screen, Skeleton, Text } from '../../src/ui';

/** Merchant shop ("pay with link"): the merchant's live offers, one tap to trade. */
export default function Shop() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { me } = useApp();
  const { t, num } = useI18n();
  const [d, setD] = useState<{ profile: any; ads: any[] } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api.merchantPage(String(handle)).then(setD).catch(() => setMissing(true)); }, [handle]);
  if (missing) return <Screen><Empty icon="storefront-outline" text={t('ui.shopMissing')} /></Screen>;
  if (!d) return <Screen><Skeleton height={260} /></Screen>;
  const p = d.profile;
  return (
    <Screen style={{ gap: space(3) }}>
      <Stack.Screen options={{ title: p.displayName }} />
      <Card style={{ alignItems: 'center', gap: 6 }} testID="shop">
        <Avatar name={p.displayName} seed={p.id} size={60} />
        <Text size="h3">{p.displayName}</Text>
        <Text size="small" tone="sub">{t('ui.tradesTotal', { n: num(String(p.tradesTotal ?? 0)) })}{p.trust ? ` · ${t('ui.trustScore')} ${p.trust.score}/100` : ''}</Text>
        <Button size="sm" variant="soft" title={t('ui.viewPassport')} onPress={() => router.push(`/profile/${p.id}`)} />
      </Card>
      <Card style={{ gap: 0 }}>
        <Text size="h3" style={{ marginBottom: space(1) }}>{t('ui.shopOffers')}</Text>
        {d.ads.length === 0 && <Text tone="sub" style={{ paddingVertical: space(4), textAlign: 'center' }}>{p.away || p.offHours ? t('ui.shopClosed') : t('market.empty')}</Text>}
        {d.ads.map((ad, i) => {
          const takerSide = ad.side === 'sell' ? 'buy' : 'sell';
          return (
            <View key={ad.id} testID="shop-ad">{i > 0 && <Divider />}
              <Row style={{ paddingVertical: space(3), gap: 10 }}>
                <AssetIcon asset={ad.asset} size={30} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text weight="600">{t(takerSide === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })} · {ad.fiat}</Text>
                  <Text size="tiny" tone="sub">{num(ad.price, 8)} · {num(ad.minAmount, 2)}–{num(ad.maxAmount, 2)} {ad.fiat}</Text>
                  <Row style={{ flexWrap: 'wrap', gap: 4 }}>{ad.paymentTypes.map((x: string) => <PayChip key={x} code={x} />)}</Row>
                </View>
                {ad.promotedUntil && new Date(ad.promotedUntil) > new Date() && <Badge label={t('ui.promoted')} tone="warning" />}
                <Button size="sm" variant={takerSide === 'buy' ? 'primary' : 'sell'} title={t(takerSide === 'buy' ? 'market.buy' : 'market.sell')} testID="shop-trade"
                  onPress={() => { if (!me) return router.push('/login'); router.push({ pathname: '/trade', params: { adId: rememberAd({ ...ad, advertiser: { ...ad.advertiser, id: p.id, displayName: p.displayName } }), side: takerSide, amount: '' } }); }} />
              </Row>
            </View>
          );
        })}
      </Card>
      <Text size="tiny" tone="sub" style={{ textAlign: 'center' }}>{t('ui.escrowNote')}</Text>
    </Screen>
  );
}
