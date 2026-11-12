import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Button, Card, Input, Notice, PayChip, PickerChip, Row, Screen, Text, errText, success } from '../src/ui';

export default function PaymentMethods() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [list, setList] = useState<any[]>([]);
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [fiat, setFiat] = useState('USD');
  const [types, setTypes] = useState<Array<{ code: string; name: string; fieldsSchema?: Array<{ name: string; optional?: boolean }> }>>([]);
  const [f, setF] = useState<{ type: string; holderName: string; details: Record<string, string> }>({ type: '', holderName: '', details: {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.paymentMethods().then(setList).catch(() => null), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null); }, []);
  useEffect(() => { api.paymentMethodTypes(fiat).then(setTypes).catch(() => setTypes([])); setF((x) => ({ ...x, type: '', details: {} })); }, [fiat]);
  const type = types.find((x) => x.code === f.type);
  const add = async () => {
    setBusy(true); setErr(null);
    try {
      await api.addPaymentMethod({ type: f.type, holderName: f.holderName, details: Object.fromEntries(Object.entries(f.details).filter(([, v]) => v)) });
      success(); setF({ type: '', holderName: '', details: {} }); await load();
    } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text tone="sub" size="small">{t('ui.pmHint')}</Text>
        {list.map((p) => (
          <Card key={p.id} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}><PayChip code={p.type} /><Ionicons name="card-outline" size={18} color={c.sub} /></Row>
            <Text weight="700">{p.type} · {p.holderName}</Text>
            <Text size="tiny" tone="sub" mono numberOfLines={1}>{Object.values(p.details ?? {}).join(' ')}</Text>
          </Card>
        ))}
        <Card style={{ gap: space(3) }}>
          <Row><Ionicons name="add-circle" size={20} color={c.primary} /><Text weight="700">{t('wallet.addMethod')}</Text></Row>
          <Row style={{ gap: 8 }}>
            <PickerChip fixed label={fiat} value={fiat} options={fiats.map((x) => ({ value: x, label: x }))} onChange={setFiat} title={t('market.fiat')} />
            <PickerChip label={type?.name ?? t('wallet.type')} value={f.type} options={types.map((x) => ({ value: x.code, label: x.name }))} onChange={(v) => setF({ ...f, type: v, details: {} })} title={t('wallet.type')} />
          </Row>
          <Input label={t('wallet.holderName')} value={f.holderName} onChangeText={(v) => setF({ ...f, holderName: v })} />
          {(type?.fieldsSchema ?? []).map((fd) => (
            <View key={fd.name}><Input label={fd.name} autoCapitalize="none" value={f.details[fd.name] ?? ''} onChangeText={(v) => setF({ ...f, details: { ...f.details, [fd.name]: v } })} /></View>
          ))}
          {err && <Notice tone="error" text={err} />}
          <Button title={t('wallet.addMethod')} disabled={!f.type || !f.holderName} loading={busy} onPress={add} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
