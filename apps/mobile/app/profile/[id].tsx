import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { space } from '../../src/theme';
import { Avatar, Badge, Card, Divider, Row, Screen, Skeleton, Text, type IconName } from '../../src/ui';

/** Public trader profile and reputation. */
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useApp();
  const { t, pct, date } = useI18n();
  const [p, setP] = useState<any>(null);
  useEffect(() => { api.profile(id).then(setP).catch(() => null); }, [id]);
  if (!p) return <Screen><Skeleton height={140} /><Skeleton height={200} /></Screen>;
  const stat = (icon: IconName, k: string, v: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}><Row style={{ gap: 6 }}><Ionicons name={icon} size={14} color={c.sub} /><Text size="tiny" tone="sub">{t(k)}</Text></Row><Text size="h3">{v}</Text></Card>
  );
  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: space(6) }}>
        <Avatar name={p.displayName} seed={id} size={72} online />
        <Row style={{ gap: 6 }}><Text size="h2">{p.displayName}</Text>{p.verifiedBadge && <Ionicons name="checkmark-circle" size={20} color={c.info} />}</Row>
        <Row><Badge label={t('profile.tier', { tier: p.kycTier })} tone="info" />{p.verifiedBadge && <Badge label={t('profile.merchant')} tone="success" />}</Row>
        <Text size="tiny" tone="sub">{t('profile.age', { days: p.accountAgeDays })}</Text>
      </Card>
      <Row style={{ flexWrap: 'wrap', gap: 10 }}>
        {stat('trending-up', 'profile.trades30d', String(p.trades30d))}
        {stat('thumbs-up', 'profile.completion', pct(p.completionRateBps))}
        {stat('timer', 'profile.avgRelease', t('common.seconds', { n: p.avgReleaseSec }))}
        {stat('hammer', 'profile.disputes', pct(p.disputeRateBps))}
      </Row>
      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}><Text weight="700">{t('profile.feedback')}</Text><Text size="small"><Text tone="buy">👍 {p.positiveFeedback}</Text>  <Text tone="sell">👎 {p.negativeFeedback}</Text></Text></Row>
        {p.recentFeedback.length === 0 && <Text size="small" tone="sub">{t('ui.noData')}</Text>}
        {p.recentFeedback.map((f: any, i: number) => (
          <View key={i}>{i > 0 && <Divider />}<Row style={{ paddingVertical: 8 }}><Ionicons name={f.positive ? 'thumbs-up' : 'thumbs-down'} size={16} color={f.positive ? c.buy : c.sell} /><Text size="small" style={{ flex: 1 }}>{f.comment || '—'}</Text><Text size="tiny" tone="sub">{date(f.createdAt)}</Text></Row></View>
        ))}
      </Card>
    </Screen>
  );
}
