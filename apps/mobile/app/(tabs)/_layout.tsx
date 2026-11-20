import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { ACTIVE } from '../../src/format';
import { TopBar } from '../../src/topbar';
import { tap } from '../../src/ui';

const VISIBLE = ['index', 'orders', 'wallet'];
// Minimal shape of the props expo-router passes to a custom tab bar.
type BottomTabBarProps = { state: { index: number; routes: Array<{ key: string; name: string }> }; navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void }; descriptors: Record<string, { options: { title?: string } }> };

/** Floating pill tab bar: Trade · Orders · Wallet (everything else lives behind the profile button). */
function PillBar({ state, navigation, descriptors, badge }: BottomTabBarProps & { badge: number }) {
  const { colors: c } = useApp();
  const ins = useSafeAreaInsets();
  const routes = state.routes.filter((r) => VISIBLE.includes(r.name));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(ins.bottom, 12), alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 999, padding: 5, gap: 4, borderWidth: 1, borderColor: c.border, width: '88%', maxWidth: 420, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
        {routes.map((r) => {
          const focused = state.routes[state.index]?.key === r.key;
          const label = String(descriptors[r.key]?.options.title ?? r.name);
          return (
            <Pressable key={r.key} testID={`tab-${r.name}`} accessibilityRole="tab" accessibilityState={{ selected: focused }}
              onPress={() => { tap(); const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!focused && !e.defaultPrevented) navigation.navigate(r.name); }}
              style={{ flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: focused ? c.ink : 'transparent' }}>
              <Text style={{ color: focused ? c.onInk : c.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
              {r.name === 'orders' && badge > 0 && <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.onPrimary, fontSize: 11, fontWeight: '700' }}>{badge}</Text></View>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors: c, me } = useApp();
  const [activeOrders, setActiveOrders] = useState(0);
  useEffect(() => {
    if (!me) { setActiveOrders(0); return; }
    const load = () => api.orders().then((o) => setActiveOrders(o.filter((x) => ACTIVE.has(x.status)).length)).catch(() => null);
    void load(); const i = setInterval(load, 20000); return () => clearInterval(i);
  }, [me]);
  const { t } = useI18n();
  return (
    <Tabs tabBar={(p) => <PillBar {...(p as unknown as BottomTabBarProps)} badge={activeOrders} />} screenOptions={{ header: () => <TopBar />, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: t('ui.trade') }} />
      <Tabs.Screen name="orders" options={{ title: t('ui.ordersNav') }} />
      <Tabs.Screen name="wallet" options={{ title: t('ui.walletNav') }} />
      <Tabs.Screen name="p2p" options={{ href: null }} />
      <Tabs.Screen name="account" options={{ href: null, title: t('ui.profile') }} />
    </Tabs>
  );
}
