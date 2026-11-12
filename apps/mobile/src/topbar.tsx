/** parley phone top bar: profile menu, wordmark, light/dark toggle. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from './app';
import { useI18n } from './i18n';
import { space } from './theme';
import { IconButton, Row, Wordmark } from './ui';

export function TopBar() {
  const { colors: c, scheme, setThemePref, me } = useApp();
  const { t } = useI18n();
  const ins = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: ins.top + 6, paddingHorizontal: space(4), paddingBottom: space(2), backgroundColor: c.bg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="person-outline" label={t('ui.profile')} onPress={() => router.push(me ? '/account' : '/login')} />
        <Wordmark size={28} />
        <IconButton icon={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'} label={t(scheme === 'dark' ? 'ui.lightMode' : 'ui.darkMode')} onPress={() => setThemePref(scheme === 'dark' ? 'light' : 'dark')} />
      </Row>
    </View>
  );
}
