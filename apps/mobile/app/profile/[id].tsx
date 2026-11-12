import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { releaseLabel } from '../../src/format';
import { space } from '../../src/theme';
import { Avatar, Badge, Big, Card, Divider, Hero, Row, Screen, Skeleton, Text } from '../../src/ui';

/** Trader passport: reputation from real trade history only. */
export default function Passport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useApp();
  const { t, pct, date, num } = useI18n();
  const [p, setP] = useState<any>(null);
  useEffect(() => { api.profile(id).then(setP).catch(() => null); }, [id]);
  if (!p) return <Screen><Skeleton height={300} /><Skeleton height={200} /></Screen>;
  const trades = p.tradesTotal ?? p.trades30d;
  const total = p.positiveFeedback + p.negativeFeedback;
  const stat = (label: string, value: string, hint?: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}><Text size="small" tone="sub">{label}</Text><Text size="h2">{value}</Text>{hint ? <Text size="tiny" tone="sub">{hint}</Text> : null}</Card>
  );
  return (
    <Screen style={{ gap: space(3), paddingTop: space(1) }}>
      <Stack.Screen options={{ title: t('ui.traderPassport') }} />
      <Hero>
        <Avatar name={p.displayName} seed={id} size={64} />
        <Row style={{ gap: 6 }}><Text size="h3">{p.displayName}</Text>{p.verifiedBadge && <Ionicons name="checkmark-circle" size={18} color={c.primary} />}</Row>
        <Text size="small" tone="sub">{t('profile.age', { days: p.accountAgeDays })}</Text>
        <Big size={trades > 0 ? 84 : 40} style={{ marginTop: space(3) }}>{trades > 0 ? pct(p.completionRateBps) : t('ui.releaseNew')}</Big>
        <Text weight="500">{trades > 0 ? t('ui.completionRate') : t('ui.noTradesYet')}</Text>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {p.kycTier >= 1 && <Badge label={t('ui.idVerified')} tone="success" />}
          <Badge label={t('profile.tier', { tier: p.kycTier })} tone="info" />
          {p.verifiedBadge && <Badge label={t('ui.merchantBond')} tone="warning" />}
        </Row>
      </Hero>
      <Row style={{ flexWrap: 'wrap', gap: space(3) }}>
        {stat(t('profile.trades30d'), num(String(p.trades30d)), t('ui.tradesTotal', { n: num(String(p.tradesTotal ?? 0)) }))}
        {stat(t('ui.usualRelease'), p.avgReleaseSec ? releaseLabel(p.avgReleaseSec, t) : '—')}
        {stat(t('profile.disputes'), pct(p.disputeRateBps))}
        {stat(t('profile.freezeReports'), num(String(p.freezeReports)))}
      </Row>
      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}><Text size="h3">{t('ui.recentFeedback')}</Text><Row style={{ gap: 12 }}><Row style={{ gap: 4 }}><Ionicons name="thumbs-up-outline" size={16} color={c.buy} /><Text weight="700">{p.positiveFeedback}</Text></Row><Row style={{ gap: 4 }}><Ionicons name="thumbs-down-outline" size={16} color={c.sell} /><Text weight="700">{p.negativeFeedback}</Text></Row></Row></Row>
        {total > 0 && <View style={{ height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.round((p.positiveFeedback / total) * 100)}%`, backgroundColor: c.buy }} /></View>}
        {p.recentFeedback.length === 0 && <Text size="small" tone="sub" style={{ textAlign: 'center', paddingVertical: space(4) }}>{t('ui.noData')}</Text>}
        {p.recentFeedback.map((f: any, i: number) => (
          <View key={i}>{i > 0 && <Divider />}<Row style={{ paddingVertical: 10 }}><Ionicons name={f.positive ? 'thumbs-up' : 'thumbs-down'} size={16} color={f.positive ? c.buy : c.sell} /><Text size="small" style={{ flex: 1 }}>{f.comment || (f.positive ? t('order.positive') : t('order.negative'))}</Text><Text size="tiny" tone="sub">{date(f.createdAt)}</Text></Row></View>
        ))}
      </Card>
    </Screen>
  );
}
