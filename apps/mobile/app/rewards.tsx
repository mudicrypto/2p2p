import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Badge, Card, Screen, Text } from '../src/ui';

/** No referral API exists yet: honest "coming soon" with no invented rewards. */
export default function Rewards() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: space(3), paddingVertical: space(8), borderColor: `${c.primary}55` }}>
        <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="gift" size={36} color={c.onPrimary} /></View>
        <Badge label={t('ui.comingSoon')} tone="warning" />
        <Text size="h2" style={{ textAlign: 'center' }}>{t('ui.rewardsTitle')}</Text>
        <Text tone="sub" style={{ textAlign: 'center' }}>{t('ui.rewardsDesc')}</Text>
      </Card>
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Ionicons name="people" size={22} color={c.primary} /><View style={{ flex: 1 }}><Text weight="700">{t('ui.inviteTitle')}</Text><Text size="small" tone="sub">{t('ui.inviteSub')}</Text></View></Card>
    </Screen>
  );
}
