import { useEffect, useRef, useState } from 'react';
import { AppState, I18nManager, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { biometricUnlock, registerForPush, tokenStore } from '../src/native';
import { initialLock, onAppState, onUnlock } from '../src/lock';
import { parseDeepLink, routeForNotification, routeToPath } from '../src/deeplink';
import { AppProvider, useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { Button, Logo, Wordmark } from '../src/ui';

function Shell() {
  const { colors: c, scheme, me, ready } = useApp();
  const welcomed = useRef(false);
  const { t, rtl } = useI18n();
  const [lock, setLock] = useState(initialLock);
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const unlock = async () => { if (await biometricUnlock(t('app.name'))) setLock(onUnlock); };
  useEffect(() => { void unlock(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (I18nManager.isRTL !== rtl) { I18nManager.allowRTL(rtl); I18nManager.forceRTL(rtl); } }, [rtl]); // applies on next launch
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setLock((l) => onAppState(l, s === 'active' ? 'active' : 'background', Date.now())));
    return () => sub.remove();
  }, []);
  useEffect(() => { if (!lock.locked && me) void tokenStore.get().then((tk) => tk && registerForPush().catch(() => null)); }, [lock.locked, me]);
  useEffect(() => {
    const go = (url: string | null) => { if (!url) return; const r = parseDeepLink(url); if (r.screen !== 'unknown') router.push(routeToPath(r) as never); };
    void Linking.getInitialURL().then(go);
    const l = Linking.addEventListener('url', (e) => go(e.url));
    const n = Notifications.addNotificationResponseReceivedListener((resp) => router.push(routeToPath(routeForNotification(resp.notification.request.content.data as Record<string, unknown>)) as never));
    return () => { l.remove(); n.remove(); };
  }, []);
  useEffect(() => { // signed-out users land on the welcome screen once per launch
    if (lock.locked || !ready || me || welcomed.current) return;
    welcomed.current = true;
    setTimeout(() => router.push('/welcome'), 0);
  }, [lock.locked, ready, me]);
  if (lock.locked) return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Logo size={84} />
      <Wordmark size={34} />
      <Button title={t('ui.unlock')} icon="finger-print" onPress={unlock} style={{ alignSelf: 'stretch' }} />
    </View>
  );
  const modal = { presentation: 'modal' as const, headerShown: true, headerStyle: { backgroundColor: c.card }, headerTintColor: c.text, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } };
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="orders/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="trade" options={{ ...modal, title: '' }} />
        <Stack.Screen name="deposit" options={{ ...modal, title: t('ui.deposit') }} />
        <Stack.Screen name="withdraw" options={{ ...modal, title: t('ui.withdraw') }} />
        <Stack.Screen name="login" options={{ ...modal, title: '' }} />
        <Stack.Screen name="signup" options={{ ...modal, title: '' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title') }} />
        <Stack.Screen name="language" options={{ ...modal, title: t('nav.language') }} />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="merchant" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="rewards" options={{ headerShown: true, title: t('ui.rewards') }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: t('ui.help') }} />
        <Stack.Screen name="ads/index" options={{ headerShown: true, title: t('ad.mine') }} />
        <Stack.Screen name="ads/new" options={{ ...modal, title: '' }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: true, title: t('wallet.paymentMethods') }} />
        <Stack.Screen name="security" options={{ headerShown: true, title: t('ui.security') }} />
        <Stack.Screen name="transfer" options={{ ...modal, title: t('ui.transfer') }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: true, title: t('ui.traderPassport') }} />
      </Stack>
    </>
  );
}

export default function Root() {
  return <SafeAreaProvider><AppProvider><Shell /></AppProvider></SafeAreaProvider>;
}
