import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Card, Divider, Press, Row, Screen, Text, type IconName } from '../src/ui';

const FAQ: Array<[string, string[]]> = [
  ['ui.faqEscrow', ['ui.why1d', 'ui.how1d']], ['ui.faqBuy', ['ui.how1d', 'ui.how2d', 'ui.how3d']], ['ui.faqSell', ['ui.pmHint', 'order.releaseHint']],
  ['ui.faqDispute', ['ui.disputeHint']], ['ui.faqFees', ['ui.hero2']], ['ui.faqSafety', ['ui.tip1', 'ui.tip2', 'ui.tip3']],
];
export default function Help() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const card = (icon: IconName, title: string, desc: string, onPress: () => void) => (
    <Press onPress={onPress} style={{ flexBasis: '48%', flexGrow: 1 }}>
      <Card style={{ gap: 6, minHeight: 120 }}><Ionicons name={icon} size={22} color={c.primary} /><Text weight="700">{title}</Text><Text size="tiny" tone="sub" numberOfLines={3}>{desc}</Text></Card>
    </Press>
  );
  return (
    <Screen>
      <Text tone="sub">{t('ui.helpSub')}</Text>
      <Row style={{ flexWrap: 'wrap', gap: 10 }}>
        {card('hammer', t('order.dispute'), t('ui.disputeHelp'), () => router.navigate('/orders'))}
        {card('pulse', t('launch.statusTitle'), t('ui.statusHelp'), () => void Linking.openURL('https://app.example.com/en/status'))}
      </Row>
      <Text size="h3">{t('ui.faq')}</Text>
      <Card style={{ paddingVertical: 0 }}>
        {FAQ.map(([q, as], i) => (
          <View key={q}>
            {i > 0 && <Divider />}
            <Press onPress={() => setOpen(open === q ? null : q)} style={{ paddingVertical: 14 }}>
              <Row style={{ justifyContent: 'space-between' }}><Text weight="600" style={{ flex: 1 }}>{t(q)}</Text><Ionicons name={open === q ? 'chevron-up' : 'chevron-down'} size={18} color={c.sub} /></Row>
              {open === q && <View style={{ gap: 6, marginTop: 8 }}>{as.map((a) => <Text key={a} size="small" tone="sub">{t(a)}</Text>)}</View>}
            </Press>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
