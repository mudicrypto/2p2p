import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { BRAND, space } from '../src/theme';
import { Button, Globe, IconButton, Logo, Text } from '../src/ui';

/** Splash / welcome (signed-out first screen). */
export default function Welcome() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top, paddingBottom: ins.bottom + space(4) }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: space(3) }}><IconButton icon="close" label="Close" onPress={() => router.back()} /></View>
      <View style={{ alignItems: 'center', marginTop: space(6), gap: space(3) }}>
        <Logo size={92} />
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 4 }}>{BRAND.name}</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 30, marginTop: space(4) }}>{t('ui.heroA')}{'\n'}<Text tone="primary" style={{ fontSize: 24, fontWeight: '700' }}>{t('ui.heroB')}</Text></Text>
        <Text tone="sub">{t('ui.fastSecureGlobal')}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}><View style={{ marginBottom: -170 }}><Globe size={420} /></View></View>
      <View style={{ paddingHorizontal: space(5), gap: space(3) }}>
        <Button size="lg" title={t('ui.getStarted')} icon="arrow-forward" onPress={() => router.replace('/signup')} testID="welcome-start" />
        <Button size="lg" variant="outline" title={t('nav.login')} onPress={() => router.replace('/login')} style={{ backgroundColor: c.card }} />
      </View>
    </View>
  );
}
