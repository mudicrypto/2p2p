import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/native';
import { useI18n } from '../../src/i18n';
import { cleanDecimal } from '../../src/decimal';
import { space } from '../../src/theme';
import { ConditionsFields, conditionsBody, conditionsOf, emptyConditions, type Conditions } from '../../src/conditions';
import { Button, Card, Input, Notice, Row, Screen, Skeleton, Text, errText, success } from '../../src/ui';

/** Edit an ad in place: price, limits, terms, counterparty conditions and auto-reply. */
export default function EditAd() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [ad, setAd] = useState<any>(null);
  const [f, setF] = useState({ price: '', minAmount: '', maxAmount: '', terms: '' });
  const [cond, setCond] = useState<Conditions>(emptyConditions);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.myAds().then((r) => {
      const a = r.find((x) => x.id === id); if (!a) return;
      setAd(a); setF({ price: a.priceType === 'fixed' ? a.price : '', minAmount: a.minAmount, maxAmount: a.maxAmount, terms: a.terms ?? '' }); setCond(conditionsOf(a));
    }).catch((e) => setErr(errText(t, e)));
  }, [id, t]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.updateAd(id, { ...(ad.priceType === 'fixed' ? { price: f.price } : {}), minAmount: f.minAmount, maxAmount: f.maxAmount, terms: f.terms, ...conditionsBody(cond) });
      success(); router.back();
    } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  };
  if (!ad) return <Screen>{err ? <Notice tone="error" text={err} /> : <Skeleton height={300} />}</Screen>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ gap: space(3) }}>
        <Text size="h2">{t('ui.editAd')}</Text>
        <Card style={{ gap: 12 }}>
          {ad.priceType === 'fixed' && <Input big label={t('ad.price')} unit={ad.fiat} keyboardType="decimal-pad" value={f.price} onChangeText={(v) => setF({ ...f, price: cleanDecimal(v) })} testID="edit-price" />}
          <Row style={{ gap: 10 }}>
            <View style={{ flex: 1 }}><Input label={`${t('ad.min')} (${ad.fiat})`} keyboardType="decimal-pad" value={f.minAmount} onChangeText={(v) => setF({ ...f, minAmount: cleanDecimal(v) })} testID="edit-min" /></View>
            <View style={{ flex: 1 }}><Input label={`${t('ad.max')} (${ad.fiat})`} keyboardType="decimal-pad" value={f.maxAmount} onChangeText={(v) => setF({ ...f, maxAmount: cleanDecimal(v) })} testID="edit-max" /></View>
          </Row>
          <Input label={t('ad.terms')} value={f.terms} onChangeText={(v) => setF({ ...f, terms: v })} multiline maxLength={2000} style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
        <ConditionsFields value={cond} onChange={setCond} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" title={t('ui.saveChanges')} loading={busy} disabled={!f.minAmount || !f.maxAmount || (ad.priceType === 'fixed' && !f.price)} onPress={save} testID="edit-save" />
      </Screen>
    </KeyboardAvoidingView>
  );
}
