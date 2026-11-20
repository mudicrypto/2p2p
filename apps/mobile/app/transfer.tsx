import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { api, biometricUnlock } from '../src/native';
import { useI18n } from '../src/i18n';
import { cleanDecimal } from '../src/decimal';
import { ASSETS } from '../src/theme';
import { AssetIcon, Button, Chip, Input, Notice, Row, Screen, Text, errText, success } from '../src/ui';

export default function Transfer() {
  const { t, num } = useI18n();
  const [asset, setAsset] = useState('USDT');
  const [bal, setBal] = useState('0');
  const [f, setF] = useState({ toUserId: '', amount: '', totp: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.balances().then((b) => setBal(b[asset]?.available ?? '0')).catch(() => null); }, [asset]);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text tone="sub">{t('ui.transferHint')}</Text>
        <Row style={{ gap: 8 }}>{ASSETS.map((a) => <Chip key={a} label={a} active={asset === a} onPress={() => setAsset(a)} left={<AssetIcon asset={a} size={18} />} />)}</Row>
        <Input label={t('ui.recipientId')} autoCapitalize="none" value={f.toUserId} onChangeText={(v) => setF({ ...f, toUserId: v.trim() })} placeholder="xxxxxxxx-xxxx-…" />
        <Input big label={t('order.amount')} unit={asset} keyboardType="decimal-pad" value={f.amount} onChangeText={(v) => setF({ ...f, amount: cleanDecimal(v) })} hint={`${t('wallet.available')}: ${num(bal)} ${asset}`} />
        <Input label={t('order.totp')} keyboardType="number-pad" maxLength={6} value={f.totp} onChangeText={(v) => setF({ ...f, totp: v.replace(/\D/g, '') })} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('ui.transfer')} loading={busy} disabled={!f.toUserId || !f.amount || f.totp.length !== 6} onPress={async () => {
          if (!(await biometricUnlock(t('ui.transfer')))) return;
          setBusy(true); setErr(null);
          try { await api.transfer({ asset, ...f }); success(); router.back(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
        }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
