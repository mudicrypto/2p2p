import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/native';
import { useI18n } from '../src/i18n';
import { Button, Input, Notice, Screen, Text, errText } from '../src/ui';

/** Sends a reset link by email; the link opens the website, where the new password is set. */
export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.forgotPassword(email.trim()); setSent(true); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {sent ? <>
          <Notice tone="success" text={t('ui.forgotSent')} />
          <Button title={t('auth.login')} onPress={() => router.back()} />
        </> : <>
          <Text tone="sub">{t('ui.forgotDesc')}</Text>
          <Input label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          {err && <Notice tone="error" text={err} />}
          <Button size="lg" title={t('ui.forgotSend')} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={submit} testID="forgot-submit" />
        </>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
