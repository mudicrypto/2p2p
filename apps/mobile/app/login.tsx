import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, registerForPush } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { Button, Input, Notice, Wordmark, Press, Row, Screen, Text, errText, success } from '../src/ui';

export default function Login() {
  const { signIn } = useApp();
  const { t } = useI18n();
  const [f, setF] = useState({ email: '', password: '', totp: '' });
  const [need2fa, setNeed2fa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.login(f.email.trim(), f.password, f.totp || undefined);
      await signIn(r.token, r.user); success();
      void registerForPush().catch(() => null);
      router.back();
    } catch (e) { if ((e as { code?: string }).code === 'TWO_FA_REQUIRED') setNeed2fa(true); else setErr(errText(t, e)); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Wordmark size={30} />
        <Text size="h1">{t('ui.welcome')}</Text>
        <Input label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={f.email} onChangeText={(email) => setF({ ...f, email })} />
        <Input label={t('auth.password')} secureTextEntry autoComplete="current-password" value={f.password} onChangeText={(password) => setF({ ...f, password })} />
        {need2fa && <Input label={t('auth.totp')} keyboardType="number-pad" maxLength={6} autoFocus value={f.totp} onChangeText={(totp) => setF({ ...f, totp })} style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />}
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('auth.login')} loading={busy} disabled={!f.email || !f.password} onPress={submit} />
        <Press onPress={() => router.replace('/signup')}><Row style={{ justifyContent: 'center' }}><Text tone="sub">{t('auth.noAccount')}</Text><Text weight="700" style={{ textDecorationLine: 'underline' }}>{t('nav.signup')}</Text></Row></Press>
      </Screen>
    </KeyboardAvoidingView>
  );
}
