import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { cachedAd } from '../src/cache';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { cleanDecimal, cryptoFor, fiatFor, fromScaled, inRange, toScaled } from '../src/decimal';
import { space } from '../src/theme';
import { AssetIcon, Avatar, Button, Card, Chip, Input, Notice, PayChip, Row, Screen, Skeleton, Text, errText, success } from '../src/ui';

export default function Trade() {
  const { adId, side, amount } = useLocalSearchParams<{ adId: string; side: 'buy' | 'sell'; amount?: string }>();
  const { colors: c } = useApp();
  const { t, money, pct } = useI18n();
  const [ad, setAd] = useState<any>(() => cachedAd(adId) ?? null);
  const [fiatAmount, setFiat] = useState(amount ?? '');
  const [crypto, setCrypto] = useState(() => { const a = cachedAd(adId); return amount && a ? cryptoFor(amount, a.price) : ''; });
  const [pms, setPms] = useState<any[]>([]);
  const [pm, setPm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.ad(adId).then((a) => setAd((prev: any) => ({ ...prev, ...a, advertiser: a.advertiser ?? prev?.advertiser }))).catch((e) => setErr(errText(t, e))); }, [adId, t]);
  useEffect(() => { if (side === 'sell' && ad) api.paymentMethods().then((m) => { const ok = m.filter((x) => ad.paymentTypes.includes(x.type)); setPms(ok); setPm(ok[0]?.id ?? ''); }).catch(() => null); }, [side, ad]);
  if (!ad) return <Screen>{err ? <Notice tone="error" text={err} /> : <Skeleton height={300} />}</Screen>;
  const ok = !!fiatAmount && inRange(fiatAmount, ad.minAmount, ad.maxAmount) && (side === 'buy' || !!pm);
  const place = async () => {
    setBusy(true); setErr(null);
    try { const o = await api.createOrder(ad.id, fiatAmount, side === 'sell' ? pm : undefined); success(); router.dismiss(); router.push(`/orders/${o.id}`); }
    catch (e) { setErr(errText(t, e)); setBusy(false); }
  };
  const isBuy = side !== 'sell';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text size="h2">{t(isBuy ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })}</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {ad.advertiser ? <><Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={42} />
          <View style={{ flex: 1 }}><Text weight="700">{ad.advertiser.displayName}</Text><Text size="tiny" tone="sub">{t('market.trades', { count: ad.advertiser.trades30d })} · {pct(ad.advertiser.completionRateBps)}</Text></View></> : <View style={{ flex: 1 }}><AssetIcon asset={ad.asset} /></View>}
          <View style={{ alignItems: 'flex-end' }}><Text size="tiny" tone="sub">{t('market.price')}</Text><Text size="h3">{money(ad.price, ad.fiat)}</Text></View>
        </Card>
        <Input big label={isBuy ? t('trade.youPay') : t('trade.youReceive')} unit={ad.fiat} keyboardType="decimal-pad" placeholder="0.00" value={fiatAmount} testID="trade-amount"
          onChangeText={(v) => { const x = cleanDecimal(v); setFiat(x); setCrypto(cryptoFor(x, ad.price)); }}
          hint={<Text size="tiny" tone={fiatAmount && !inRange(fiatAmount, ad.minAmount, ad.maxAmount) ? 'sell' : 'sub'}>{t('market.limits')}: {money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</Text>} />
        <Row style={{ justifyContent: 'center', marginVertical: -8 }}><View style={{ backgroundColor: c.card, borderRadius: 20, padding: 6 }}><Ionicons name="swap-vertical" size={16} color={c.sub} /></View></Row>
        <Input big label={isBuy ? t('trade.youReceive') : t('trade.youSell')} unit={<Row style={{ gap: 6 }}><AssetIcon asset={ad.asset} size={18} /><Text weight="700">{ad.asset}</Text></Row>} keyboardType="decimal-pad" placeholder="0.00" value={crypto}
          onChangeText={(v) => { const x = cleanDecimal(v); setCrypto(x); setFiat(fiatFor(x, ad.price)); }} />
        <Row style={{ gap: 8 }}>{['25', '50', '100'].map((p) => <Chip key={p} label={p === '100' ? 'MAX' : `${p}%`} onPress={() => { const max = ad.maxAmount; const v = p === '100' ? max : fromScaled((toScaled(max) * BigInt(p)) / 100n, 2); setFiat(v); setCrypto(cryptoFor(v, ad.price)); }} />)}</Row>
        {!isBuy && <View style={{ gap: 8 }}><Text size="small" tone="sub" weight="500">{t('trade.receivingAccount')}</Text>
          {pms.length === 0 ? <Notice tone="warn" text={t('ui.pmHint')} /> : <Row style={{ flexWrap: 'wrap' }}>{pms.map((m) => <Chip key={m.id} label={`${m.type} · ${m.holderName}`} active={pm === m.id} onPress={() => setPm(m.id)} />)}</Row>}</View>}
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</Row>
        {!!ad.terms && <Card style={{ gap: 4 }}><Text size="small" weight="700">{t('trade.terms')}</Text><Text size="small" tone="sub">{ad.terms}</Text></Card>}
        <Notice text={`${t('ui.how1d')} ${t('trade.window', { minutes: ad.paymentWindowMin })}`} />
        {err && <Notice tone="error" text={err} />}
        <Button size="lg" variant={isBuy ? 'buy' : 'sell'} title={t('trade.confirm')} disabled={!ok} loading={busy} onPress={place} testID="place-order" />
        <View style={{ height: space(4) }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
