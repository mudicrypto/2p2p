import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { cleanDecimal, marginToBps } from '../../src/decimal';
import { ASSETS, space } from '../../src/theme';
import { AssetIcon, Button, Card, Chip, Input, Notice, PayChip, PickerChip, Press, Row, Screen, Segmented, Text, errText, success } from '../../src/ui';

export default function NewAd() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [f, setF] = useState({ side: 'sell' as 'buy' | 'sell', asset: 'USDT', fiat: 'USD', priceType: 'fixed' as 'fixed' | 'floating', price: '', margin: '0', totalAmount: '', minAmount: '', maxAmount: '', paymentWindowMin: '15', terms: '' });
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [methods, setMethods] = useState<any[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null);
    api.paymentMethods().then(setMethods).catch(() => null);
  }, []);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const usable = methods; // server validates fiat/method compatibility and returns a clear error
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.createAd({
        side: f.side, asset: f.asset, fiat: f.fiat, priceType: f.priceType,
        price: f.priceType === 'fixed' ? f.price : undefined, marginBps: f.priceType === 'floating' ? marginToBps(f.margin) : undefined,
        totalAmount: f.totalAmount, minAmount: f.minAmount, maxAmount: f.maxAmount, paymentMethodIds: sel,
        paymentWindowMin: Number(f.paymentWindowMin), terms: f.terms, minCounterpartyTier: 0,
      });
      success(); router.replace('/ads');
    } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };
  const ok = (f.priceType === 'fixed' ? !!f.price : true) && !!f.totalAmount && !!f.minAmount && !!f.maxAmount && sel.length > 0;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text size="h2">{t('ad.new')}</Text>
        <Card style={{ gap: space(3) }}>
          <Text weight="700">1 · {t('ui.stepPrice')}</Text>
          <Segmented value={f.side} onChange={(v) => set({ side: v })} options={[{ value: 'sell', label: t('ad.sideSell') }, { value: 'buy', label: t('ad.sideBuy') }]} colors={{ sell: c.sell, buy: c.primary }} />
          <Row style={{ gap: 8 }}>{ASSETS.map((a) => <Chip key={a} label={a} active={f.asset === a} onPress={() => set({ asset: a })} left={<AssetIcon asset={a} size={18} />} />)}</Row>
          <Row style={{ gap: 8 }}>
            <PickerChip fixed label={f.fiat} value={f.fiat} options={fiats.map((x) => ({ value: x, label: x }))} onChange={(v) => set({ fiat: v })} title={t('market.fiat')} />
            <PickerChip label={t(f.priceType === 'fixed' ? 'ad.fixed' : 'ad.floating')} value={f.priceType} options={[{ value: 'fixed', label: t('ad.fixed') }, { value: 'floating', label: t('ad.floating') }]} onChange={(v) => set({ priceType: v })} title={t('ad.priceType')} />
          </Row>
          {f.priceType === 'fixed'
            ? <Input big label={t('ad.price')} unit={f.fiat} keyboardType="decimal-pad" value={f.price} onChangeText={(v) => set({ price: cleanDecimal(v) })} placeholder="0.00" />
            : <Input label={t('ad.margin')} unit="%" keyboardType="numbers-and-punctuation" value={f.margin} onChangeText={(v) => set({ margin: v.replace(/[^\d.-]/g, '') })} />}
        </Card>
        <Card style={{ gap: space(3) }}>
          <Text weight="700">2 · {t('ui.stepAmount')}</Text>
          <Input label={`${t('ad.total')} (${f.asset})`} keyboardType="decimal-pad" value={f.totalAmount} onChangeText={(v) => set({ totalAmount: cleanDecimal(v) })} />
          <Row style={{ gap: 10 }}>
            <View style={{ flex: 1 }}><Input label={`${t('ad.min')} (${f.fiat})`} keyboardType="decimal-pad" value={f.minAmount} onChangeText={(v) => set({ minAmount: cleanDecimal(v) })} /></View>
            <View style={{ flex: 1 }}><Input label={`${t('ad.max')} (${f.fiat})`} keyboardType="decimal-pad" value={f.maxAmount} onChangeText={(v) => set({ maxAmount: cleanDecimal(v) })} /></View>
          </Row>
        </Card>
        <Card style={{ gap: space(3) }}>
          <Text weight="700">3 · {t('ui.stepPayment')}</Text>
          {usable.length === 0 ? (
            <Press onPress={() => router.push('/payment-methods')}><Notice tone="warn" text={`${t('wallet.addMethod')} →`} /></Press>
          ) : usable.map((m) => {
            const on = sel.includes(m.id);
            return (
              <Press key={m.id} onPress={() => setSel(on ? sel.filter((x) => x !== m.id) : [...sel, m.id])}>
                <Row style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}14` : 'transparent' }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? c.primary : c.sub} />
                  <PayChip code={m.type} /><Text tone="sub" style={{ flex: 1 }} numberOfLines={1}>{m.holderName}</Text>
                </Row>
              </Press>
            );
          })}
          <PickerChip fixed label={`${t('ad.window')}: ${f.paymentWindowMin}`} value={f.paymentWindowMin} options={['15', '30', '45', '60', '120'].map((n) => ({ value: n, label: t('common.minutes', { n }) }))} onChange={(v) => set({ paymentWindowMin: v })} title={t('ad.window')} />
          <Input label={t('ad.terms')} value={f.terms} onChangeText={(v) => set({ terms: v })} multiline maxLength={2000} style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('ad.submit')} disabled={!ok} loading={busy} onPress={submit} testID="publish-ad" />
      </Screen>
    </KeyboardAvoidingView>
  );
}
