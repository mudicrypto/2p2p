/** Native integrations: secure token storage, biometrics, push registration. */
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createApi } from './api';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL || ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:4000');
const TOKEN_KEY = 'p2p.session';
let cached: string | null = null;
/** Session token lives in the Keychain/Keystore. The web build is a design preview only and keeps it in sessionStorage. */
const web = Platform.OS === 'web';
export const tokenStore = {
  get: async () => (cached ??= web ? globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (t: string | null) => {
    cached = t;
    if (web) { if (t) globalThis.sessionStorage?.setItem(TOKEN_KEY, t); else globalThis.sessionStorage?.removeItem(TOKEN_KEY); return; }
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};
export const api = createApi(API_URL, tokenStore.get, Constants.sessionId);

export async function biometricUnlock(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const has = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  if (!has) return true; // device without biometrics: the OS passcode/session still protects; server 2FA guards money actions
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false });
  return r.success;
}

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });
export async function registerForPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('orders', { name: 'Orders', importance: Notifications.AndroidImportance.HIGH });
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId; // TODO(provider): EAS project id
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await api.registerPush(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return token;
}
