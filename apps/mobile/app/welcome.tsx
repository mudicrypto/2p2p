import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Button, Glow, IconButton, Row, Text, Wordmark } from '../src/ui';

/** Welcome (signed-out first screen): parley's promise and the three steps. */
export default function Welcome() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const ins = useSafeAreaInsets();
  const steps = [t('ui.stepAccount'), t('ui.stepVerifyId'), t('ui.trade')];
  return (
    <View style={{ flex: 1, zIndex: 0, backgroundColor: c.bg, paddingTop: ins.top, paddingBottom: ins.bottom + space(4) }}>
      <Glow color={c.glow} />
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <View style={{ width: 44 }} /><Wordmark size={30} /><IconButton icon="close" label="Close" onPress={() => router.back()} />
      </Row>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space(6), gap: space(5) }}>
        <Text style={{ fontSize: 46, fontWeight: '700', letterSpacing: -1.8, lineHeight: 50 }}>{t('ui.authHero')}</Text>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {steps.map((s, i) => (
            <View key={s} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: i === 0 ? c.primary : c.border, backgroundColor: i === 0 ? c.primary : 'transparent' }}>
              <Text size="small" weight="600" style={{ color: i === 0 ? c.onPrimary : c.text }}>{i + 1} · {s}</Text>
            </View>
          ))}
        </Row>
        <Text tone="sub">{t('ui.escrowNote')}</Text>
      </View>
      <View style={{ paddingHorizontal: space(5), gap: space(3) }}>
        <Button size="lg" title={t('ui.getStarted')} onPress={() => router.replace('/signup')} testID="welcome-start" />
        <Button size="lg" variant="soft" title={t('nav.login')} onPress={() => router.replace('/login')} />
      </View>
    </View>
  );
}
