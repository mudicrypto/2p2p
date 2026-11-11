import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { Button, Input, Logo, Notice, Press, Row, Screen, Text, errText, success } from '../src/ui';

export default function Signup() {
  const { signIn } = useApp();
  const { t, locale } = useI18n();
  const [f, setF] = useState({ email: '', password: '', country: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.signup(f.email.trim(), f.password, f.country.toUpperCase(), locale);
      if (r.devEmailToken) { // mock mode: verify and sign in straight away
        await api.verifyEmail(r.devEmailToken);
        const l = await api.login(f.email.trim(), f.password);
        await signIn(l.token, l.user); success(); router.back(); return;
      }
      setDone(true);
    } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };
  if (done) return <Screen><Ionicons name="mail-open" size={48} color="#7b61ff" /><Text size="h2">{t('auth.verifyEmail')}</Text><Text tone="sub">{t('auth.checkEmail')}</Text><Button title={t('auth.login')} onPress={() => router.replace('/login')} /></Screen>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Logo size={52} />
        <Text size="h1">{t('auth.signup')}</Text>
        <Text tone="sub">{t('ui.authSub')}</Text>
        <Input label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={f.email} onChangeText={(email) => setF({ ...f, email })} />
        <Input label={t('auth.password')} secureTextEntry autoComplete="new-password" value={f.password} onChangeText={(password) => setF({ ...f, password })} hint={t('ui.passwordDesc')} />
        <Input label={t('auth.country')} autoCapitalize="characters" maxLength={2} placeholder="DE" value={f.country} onChangeText={(country) => setF({ ...f, country: country.toUpperCase() })} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('auth.signup')} loading={busy} disabled={!f.email || f.password.length < 10 || f.country.length !== 2} onPress={submit} />
        <Press onPress={() => router.replace('/login')}><Row style={{ justifyContent: 'center' }}><Text tone="sub">{t('auth.haveAccount')}</Text><Text tone="primary" weight="700">{t('nav.login')}</Text></Row></Press>
      </Screen>
    </KeyboardAvoidingView>
  );
}
