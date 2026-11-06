import { useEffect, useRef, useState } from 'react';
import { AppState, Button, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { biometricUnlock, registerForPush, tokenStore } from '../src/native';
import { initialLock, onAppState, onUnlock } from '../src/lock';
import { parseDeepLink, routeForNotification, routeToPath } from '../src/deeplink';

export default function Root() {
  const [lock, setLock] = useState(initialLock);
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const unlock = async () => { if (await biometricUnlock('Unlock P2P Exchange')) setLock(onUnlock); };
  useEffect(() => { void unlock(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setLock((l) => onAppState(l, s === 'active' ? 'active' : 'background', Date.now())));
    return () => sub.remove();
  }, []);
  useEffect(() => { if (!lock.locked) void tokenStore.get().then((t) => t && registerForPush().catch(() => null)); }, [lock.locked]);
  // Deep links (custom scheme + universal links) and notification taps.
  useEffect(() => {
    const go = (url: string | null) => { if (!url) return; const r = parseDeepLink(url); if (r.screen !== 'unknown') router.push(routeToPath(r) as never); };
    void Linking.getInitialURL().then(go);
    const l = Linking.addEventListener('url', (e) => go(e.url));
    const n = Notifications.addNotificationResponseReceivedListener((resp) => router.push(routeToPath(routeForNotification(resp.notification.request.content.data as Record<string, unknown>)) as never));
    return () => { l.remove(); n.remove(); };
  }, []);
  if (lock.locked) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 18 }}>P2P Exchange is locked</Text>
      <Button title="Unlock" onPress={unlock} />
    </View>
  );
  return (<><StatusBar style="auto" /><Stack screenOptions={{ headerTitleAlign: 'center' }} /></>);
}
