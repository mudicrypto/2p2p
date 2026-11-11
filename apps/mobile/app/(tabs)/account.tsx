import { useCallback, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { NATIVE_NAMES } from '../../src/locales';
import { space } from '../../src/theme';
import { Avatar, Badge, Button, Card, Divider, Globe, Logo, Notice, Press, Row, Segmented, Text, errText, type IconName } from '../../src/ui';

export default function Account() {
  const { colors: c, me, refresh, signOut, themePref, setThemePref, locale, testMode } = useApp();
  const { t } = useI18n();
  const ins = useSafeAreaInsets();
  const [kyc, setKyc] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { if (me) api.kycStatus().then(setKyc).catch(() => null); }, [me]));
  const item = (icon: IconName, label: string, right?: React.ReactNode, onPress?: () => void) => (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={18} color={c.primary} /></View>
      <Text weight="600" style={{ flex: 1 }}>{label}</Text>{right}{onPress && <Ionicons name="chevron-forward" size={16} color={c.sub} />}
    </Press>
  );
  const prefs = (
    <Card style={{ paddingVertical: 4 }}>
      {item('language', t('nav.language'), <Text tone="sub" size="small">{NATIVE_NAMES[locale]}</Text>, () => router.push('/language'))}
      <Divider />
      <View style={{ paddingVertical: 12, gap: 8 }}><Row><Ionicons name="contrast" size={18} color={c.primary} /><Text weight="600">{t('ui.theme')}</Text></Row>
        <Segmented value={themePref} onChange={setThemePref} options={[{ value: 'system', label: t('ui.themeAuto') }, { value: 'dark', label: '☾' }, { value: 'light', label: '☀︎' }]} /></View>
      <Divider />
      {item('document-text', t('launch.terms'), undefined, () => void Linking.openURL('https://app.example.com/en/legal/terms'))}
      {item('pulse', t('launch.statusTitle'), undefined, () => void Linking.openURL('https://app.example.com/en/status'))}
    </Card>
  );
  if (!me) return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: ins.top + space(4), gap: space(4) }}>
      <View style={{ borderRadius: 28, padding: space(6), gap: space(3), backgroundColor: c.card, borderWidth: 1, borderColor: `${c.primary}55`, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -80, bottom: -90 }}><Globe size={260} opacity={0.6} /></View>
        <Logo size={44} />
        <Text size="h2">{t('ui.authTitle')}</Text>
        <Text tone="sub">{t('ui.authSub')}</Text>
        <Row style={{ marginTop: space(2) }}><Button title={t('nav.signup')} onPress={() => router.push('/signup')} style={{ flex: 1 }} /><Button variant="outline" title={t('nav.login')} onPress={() => router.push('/login')} style={{ flex: 1 }} /></Row>
      </View>
      {prefs}
    </ScrollView>
  );
  const tier = me.kycTier ?? 0;
  const pending = kyc?.applications?.some((a: any) => a.status === 'pending');
  const name = me.displayName ?? me.email ?? me.id.slice(0, 8);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: ins.top + space(4), gap: space(4), paddingBottom: space(10) }}>
      <Row style={{ gap: 14 }}>
        <Avatar name={name} seed={me.id} size={60} />
        <View style={{ flex: 1, gap: 4 }}><Text size="h3" numberOfLines={1}>{name}</Text><Row><Badge label={t('profile.tier', { tier })} tone="info" />{me.totpEnabled && <Badge label="2FA" tone="success" />}</Row></View>
      </Row>
      <Card style={{ gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}><Text weight="700">{t('ui.verification')}</Text><Text size="small" tone="sub">{t('ui.level', { n: tier })}</Text></Row>
        <Row style={{ gap: 6 }}>{[1, 2, 3].map((l) => <View key={l} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: l <= tier ? c.primary : c.muted }} />)}</Row>
        {tier < 3 && (pending ? <Badge label={t('ui.pending')} tone="warning" /> : <>
          <Text size="small" tone="sub">{t(`ui.level${tier + 1}`)} · {t(`ui.level${tier + 1}d`)}</Text>
          <Button title={t('ui.verifyNow')} icon="shield-checkmark" onPress={async () => {
            setErr(null);
            try { const s = await api.kycStart(tier + 1); if (testMode) await api.devKycApprove(s.providerRef).catch(() => null); else if (s.url) await Linking.openURL(s.url); await refresh(); api.kycStatus().then(setKyc).catch(() => null); }
            catch (e) { setErr(errText(t, e)); }
          }} />
        </>)}
        {err && <Notice tone="error" text={err} />}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        {item('notifications', t('nav.notifications'), undefined, () => router.push('/notifications'))}
        <Divider />
        {item('phone-portrait', t('ui.twoFa'), <Badge label={me.totpEnabled ? '✓' : '—'} tone={me.totpEnabled ? 'success' : 'default'} />)}
        <Divider />
        {item('finger-print', t('ui.passkeys'))}
        <Divider />
        {item('person', t('profile.title'), undefined, () => void Linking.openURL(`https://app.example.com/en/profile/${me.id}`))}
      </Card>
      {prefs}
      <Button variant="outline" icon="log-out-outline" title={t('nav.logout')} onPress={signOut} />
    </ScrollView>
  );
}
