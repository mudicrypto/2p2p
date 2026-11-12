import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { Button, Hero, Input, Notice, Press, Row, Screen, Text, Wordmark, errText, success } from '../src/ui';
import { space } from '../src/theme';

export default function Signup() {
  const { signIn, colors: c } = useApp();
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
  if (done) return <Screen><Ionicons name="mail-open-outline" size={48} color={c.primary} /><Text size="h2">{t('auth.verifyEmail')}</Text><Text tone="sub">{t('auth.checkEmail')}</Text><Button title={t('auth.login')} onPress={() => router.replace('/login')} /></Screen>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Hero style={{ alignItems: 'flex-start', paddingVertical: space(6) }}>
          <Wordmark size={26} />
          <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1.2, lineHeight: 38 }}>{t('ui.authHero')}</Text>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>{[t('ui.stepAccount'), t('ui.stepVerifyId'), t('ui.trade')].map((s, i) => (
            <View key={s} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: i === 0 ? c.primary : c.border, backgroundColor: i === 0 ? c.primary : 'transparent' }}><Text size="tiny" weight="600" style={{ color: i === 0 ? c.onPrimary : c.text }}>{i + 1} · {s}</Text></View>
          ))}</Row>
        </Hero>
        <Input label={t('auth.email')} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={f.email} onChangeText={(email) => setF({ ...f, email })} />
        <Input label={t('auth.password')} secureTextEntry autoComplete="new-password" value={f.password} onChangeText={(password) => setF({ ...f, password })} hint={t('ui.passwordDesc')} />
        <Input label={t('auth.country')} autoCapitalize="characters" maxLength={2} placeholder="DE" value={f.country} onChangeText={(country) => setF({ ...f, country: country.toUpperCase() })} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('auth.signup')} loading={busy} disabled={!f.email || f.password.length < 10 || f.country.length !== 2} onPress={submit} />
        <Press onPress={() => router.replace('/login')}><Row style={{ justifyContent: 'center' }}><Text tone="sub">{t('auth.haveAccount')}</Text><Text weight="700" style={{ textDecorationLine: 'underline' }}>{t('nav.login')}</Text></Row></Press>
      </Screen>
    </KeyboardAvoidingView>
  );
}
