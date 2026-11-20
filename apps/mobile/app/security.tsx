import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { radius, space } from '../src/theme';
import { Badge, Button, Card, CopyRow, Input, Notice, Row, Screen, Text, errText, success } from '../src/ui';

export default function Security() {
  const { colors: c, me, refresh } = useApp();
  const { t } = useI18n();
  const [totp, setTotp] = useState<{ secret?: string; url?: string; code: string }>({ code: '' });
  const [pw, setPw] = useState({ old: '', next: '', code: '', ok: false });
  const [ph, setPh] = useState({ phone: '', code: '', sent: false, dev: '' });
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); success(); await refresh(); } catch (e) { setErr(errText(t, e)); } };
  if (!me) return null;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {err && <Notice tone="error" text={err} />}
        <Card style={{ gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}><Row><Ionicons name="phone-portrait" size={20} color={c.primary} /><Text weight="700">{t('ui.twoFa')}</Text></Row>{me.totpEnabled && <Badge label="✓" tone="success" />}</Row>
          <Text size="small" tone="sub">{t('ui.twoFaDesc')}</Text>
          {me.totpEnabled ? <Notice tone="success" text={t('auth.enabled')} /> : totp.secret ? <>
            <Text size="small">{t('auth.scan')}</Text>
            {totp.url && <View style={{ alignSelf: 'center', padding: 10, backgroundColor: '#fff', borderRadius: radius.md }}><QRCode value={totp.url} size={170} /></View>}
            <View style={{ backgroundColor: c.muted, borderRadius: radius.md, paddingHorizontal: 12 }}><CopyRow label={t('ui.secretKey')} value={totp.secret} mono /></View>
            {totp.url && <Button variant="outline" size="sm" icon="open-outline" title={t('ui.openAuthenticator')} onPress={() => void Linking.openURL(totp.url!).catch(() => null)} />}
            <Input label={t('auth.code')} keyboardType="number-pad" maxLength={6} value={totp.code} onChangeText={(v) => setTotp({ ...totp, code: v.replace(/\D/g, '') })} style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
            <Button title={t('auth.enable')} disabled={totp.code.length !== 6} onPress={() => run(() => api.totpConfirm(totp.code))} />
          </> : <Button title={t('auth.setup2fa')} onPress={() => run(async () => { const r = await api.totpSetup(); setTotp({ secret: r.secret, url: r.otpauthUrl, code: '' }); })} />}
        </Card>
        <Card style={{ gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}><Row><Ionicons name="call" size={20} color={c.primary} /><Text weight="700">{t('auth.phone')}</Text></Row>{me.phoneVerified && <Badge label="✓" tone="success" />}</Row>
          <Text size="small" tone="sub">{t('ui.phoneDesc')}</Text>
          {!me.phoneVerified && <>
            <Input placeholder="+234…" keyboardType="phone-pad" value={ph.phone} onChangeText={(v) => setPh({ ...ph, phone: v.trim() })} />
            {!ph.sent ? <Button variant="outline" title={t('auth.sendCode')} disabled={ph.phone.length < 8} onPress={() => run(async () => { const r = await api.phoneStart(ph.phone); setPh((x) => ({ ...x, sent: true, dev: r.devCode ?? '' })); })} /> : <>
              <Input label={t('auth.code')} keyboardType="number-pad" maxLength={6} placeholder={ph.dev} value={ph.code} onChangeText={(v) => setPh({ ...ph, code: v.replace(/\D/g, '') })} />
              <Button title={t('auth.verifyPhone')} disabled={ph.code.length !== 6} onPress={() => run(() => api.phoneVerify(ph.phone, ph.code))} />
            </>}
          </>}
        </Card>
        <Card style={{ gap: space(3) }}>
          <Row><Ionicons name="lock-closed" size={20} color={c.primary} /><Text weight="700">{t('auth.password')}</Text></Row>
          <Input secureTextEntry placeholder={t('ui.currentPassword')} value={pw.old} onChangeText={(v) => setPw({ ...pw, old: v, ok: false })} />
          <Input secureTextEntry placeholder={t('ui.newPassword')} value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v, ok: false })} hint={t('ui.passwordDesc')} />
          {me.totpEnabled && <Input placeholder={t('auth.totp')} keyboardType="number-pad" maxLength={6} value={pw.code} onChangeText={(v) => setPw({ ...pw, code: v })} />}
          <Button variant="outline" title={pw.ok ? t('ui.changed') : t('common.save')} disabled={!pw.old || pw.next.length < 10} onPress={() => run(async () => { await api.changePassword(pw.old, pw.next, pw.code || undefined); setPw({ old: '', next: '', code: '', ok: true }); })} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
