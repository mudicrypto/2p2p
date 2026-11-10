import { Tabs } from 'expo-router/tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';

export default function TabsLayout() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const icon = (n: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: unknown; focused: boolean }) => <Ionicons name={(focused ? n : `${n}-outline`) as keyof typeof Ionicons.glyphMap} size={23} color={color as string} />;
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.sub,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: t('nav.market'), tabBarIcon: icon('storefront') }} />
      <Tabs.Screen name="orders" options={{ title: t('nav.orders'), tabBarIcon: icon('receipt') }} />
      <Tabs.Screen name="wallet" options={{ title: t('nav.wallet'), tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="account" options={{ title: t('ui.account'), tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
