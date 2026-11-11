import { useEffect, useState } from 'react';
import { api } from '../../src/native';
import { Tabs } from 'expo-router/tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';

export default function TabsLayout() {
  const { colors: c, me } = useApp();
  const [activeOrders, setActiveOrders] = useState(0);
  useEffect(() => {
    if (!me) { setActiveOrders(0); return; }
    const load = () => api.orders().then((o) => setActiveOrders(o.filter((x) => ['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED'].includes(x.status)).length)).catch(() => null);
    void load(); const i = setInterval(load, 20000); return () => clearInterval(i);
  }, [me]);
  const { t } = useI18n();
  const icon = (n: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: unknown; focused: boolean }) => <Ionicons name={(focused ? n : `${n}-outline`) as keyof typeof Ionicons.glyphMap} size={23} color={color as string} />;
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.sub,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: undefined }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: t('ui.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="p2p" options={{ title: 'P2P', tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="orders" options={{ title: t('nav.orders'), tabBarIcon: icon('receipt'), tabBarBadge: activeOrders || undefined, tabBarBadgeStyle: { backgroundColor: c.sell, fontSize: 10 } }} />
      <Tabs.Screen name="wallet" options={{ title: t('nav.wallet'), tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="account" options={{ title: t('ui.profile'), tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
