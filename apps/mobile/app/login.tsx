import { useState } from 'react';
import { Alert, Button, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api, tokenStore, registerForPush } from '../src/native';
import { MobileApiError } from '../src/api';

export default function Login() {
  const [f, setF] = useState({ email: '', password: '', totp: '' });
  const submit = async () => {
    try {
      const r = await api.login(f.email, f.password, f.totp || undefined);
      await tokenStore.set(r.token);
      void registerForPush().catch(() => null);
      router.replace('/');
    } catch (e) { Alert.alert(e instanceof MobileApiError && e.code === 'TWO_FA_REQUIRED' ? 'Enter your 2FA code' : 'Login failed', (e as Error).message); }
  };
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={(email) => setF({ ...f, email })} style={{ borderWidth: 1, padding: 10 }} />
      <TextInput placeholder="Password" secureTextEntry value={f.password} onChangeText={(password) => setF({ ...f, password })} style={{ borderWidth: 1, padding: 10 }} />
      <TextInput placeholder="2FA code (if enabled)" keyboardType="number-pad" value={f.totp} onChangeText={(totp) => setF({ ...f, totp })} style={{ borderWidth: 1, padding: 10 }} />
      <Button title="Log in" onPress={submit} />
    </View>
  );
}
