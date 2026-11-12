import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { api, biometricUnlock } from '../src/native';
import { useI18n } from '../src/i18n';
import { useColors } from '../src/app';
import { cleanDecimal } from '../src/decimal';
import { ASSETS, NETWORKS } from '../src/theme';
import { AssetIcon, Badge, Button, Card, Chip, Input, Notice, Press, Row, Screen, Text, errText, success } from '../src/ui';

export default function Withdraw() {
  const { t, num, date } = useI18n();
  const c = useColors();
  const [asset, setAsset] = useState('USDT');
  const [network, setNetwork] = useState(NETWORKS.USDT[0]);
  const [list, setList] = useState<any[]>([]);
  const [bal, setBal] = useState('0');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [totp, setTotp] = useState('');
  const [adding, setAdding] = useState(false);
  const [na, setNa] = useState({ address: '', label: '', totp: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => api.addresses().then(setList).catch(() => null), []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { api.balances().then((b) => setBal(b[asset]?.available ?? '0')).catch(() => null); }, [asset]);
  const ready = (x: any) => new Date(x.activeAt).getTime() <= Date.now();
  const mine = list.filter((x) => x.asset === asset && x.network === network);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Row style={{ gap: 8 }}>{ASSETS.map((a) => <Chip key={a} label={a} active={asset === a} left={<AssetIcon asset={a} size={18} />} onPress={() => { setAsset(a); setNetwork(NETWORKS[a][0]); setAddress(''); }} />)}</Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{NETWORKS[asset].map((n) => <Chip key={n} label={n} active={network === n} onPress={() => { setNetwork(n); setAddress(''); }} />)}</ScrollView>
        <Text size="small" tone="sub" weight="500">{t('ui.address')}</Text>
        {mine.map((x) => (
          <Press key={x.id} disabled={!ready(x)} onPress={() => setAddress(x.address)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: address === x.address ? c.primary : 'transparent', opacity: ready(x) ? 1 : 0.6 }}>
              <View style={{ flex: 1 }}><Text weight="700">{x.label || network}</Text><Text size="tiny" tone="sub" mono numberOfLines={1}>{x.address}</Text></View>
              {!ready(x) && <Badge label={date(x.activeAt)} tone="warning" />}
            </Card>
          </Press>
        ))}
        {adding ? (
          <Card style={{ gap: 10 }}>
            <Input placeholder={t('ui.address')} autoCapitalize="none" value={na.address} onChangeText={(v) => setNa({ ...na, address: v.trim() })} />
            <Input placeholder={t('ui.label')} value={na.label} onChangeText={(v) => setNa({ ...na, label: v })} />
            <Input placeholder={t('order.totp')} keyboardType="number-pad" maxLength={6} value={na.totp} onChangeText={(v) => setNa({ ...na, totp: v.replace(/\D/g, '') })} />
            <Notice text={t('ui.withdrawNote')} />
            <Button title={t('common.save')} onPress={async () => { setErr(null); try { await api.addAddress({ asset, network, ...na, label: na.label || undefined }); setAdding(false); setNa({ address: '', label: '', totp: '' }); await reload(); } catch (e) { setErr(errText(t, e)); } }} />
          </Card>
        ) : <Button variant="ghost" icon="add" title={t('ui.addAddress')} onPress={() => setAdding(true)} />}
        <Input big label={t('order.amount')} keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={(v) => setAmount(cleanDecimal(v))}
          unit={<Press onPress={() => setAmount(bal)}><Text tone="primary" weight="800">MAX</Text></Press>} hint={`${t('wallet.available')}: ${num(bal)} ${asset}`} />
        <Input label={t('order.totp')} keyboardType="number-pad" maxLength={6} value={totp} onChangeText={(v) => setTotp(v.replace(/\D/g, ''))} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('ui.withdraw')} loading={busy} disabled={!address || !amount || totp.length !== 6} onPress={async () => {
          if (!(await biometricUnlock(t('ui.withdraw')))) return;
          setBusy(true); setErr(null);
          try { await api.withdraw({ asset, network, address, amount, totp }); success(); router.back(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
        }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
