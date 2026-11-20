import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '../src/native';
import { useI18n } from '../src/i18n';
import { cleanDecimal } from '../src/decimal';
import { ASSETS, space } from '../src/theme';
import { Badge, Button, Card, Divider, Input, Notice, PickerChip, Row, Screen, Segmented, Text, errText, success } from '../src/ui';

/** Large trade desk: request form; staff follow up by email. */
export default function Otc() {
  const { t, money, date } = useI18n();
  const [f, setF] = useState({ side: 'buy' as 'buy' | 'sell', asset: 'USDT', fiat: 'USD', fiatAmount: '', note: '' });
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [mine, setMine] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.otcRequests().then(setMine).catch(() => null), []);
  useEffect(() => { api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null); void load(); }, [load]);
  const submit = async () => {
    setBusy(true); setMsg(null);
    try { await api.createOtc({ ...f, note: f.note.trim() || undefined }); success(); setMsg({ ok: true, text: t('ui.otcSent') }); setF({ ...f, fiatAmount: '', note: '' }); await load(); }
    catch (e) { setMsg({ ok: false, text: errText(t, e) }); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ gap: space(3) }}>
        <Text tone="sub">{t('ui.otcDesc')}</Text>
        <Card style={{ gap: 12 }}>
          <Segmented value={f.side} onChange={(side) => setF({ ...f, side })} options={[{ value: 'buy', label: t('market.buy') }, { value: 'sell', label: t('market.sell') }]} />
          <Row style={{ gap: 8 }}>
            <PickerChip fixed label={f.asset} value={f.asset} options={ASSETS.map((a) => ({ value: a, label: a }))} onChange={(asset) => setF({ ...f, asset })} title={t('market.asset')} />
            <PickerChip fixed label={f.fiat} value={f.fiat} options={fiats.map((x) => ({ value: x, label: x }))} onChange={(fiat) => setF({ ...f, fiat })} title={t('market.fiat')} />
          </Row>
          <Input big label={t('ui.otcAmount', { fiat: f.fiat })} unit={f.fiat} keyboardType="decimal-pad" value={f.fiatAmount} onChangeText={(v) => setF({ ...f, fiatAmount: cleanDecimal(v) })} testID="otc-amount" />
          <Input label={t('ui.otcNote')} value={f.note} onChangeText={(note) => setF({ ...f, note })} multiline maxLength={1000} style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
        {msg && <Notice tone={msg.ok ? 'success' : 'error'} text={msg.text} />}
        <Button size="lg" icon="send" title={t('ui.otcSubmit')} disabled={!f.fiatAmount} loading={busy} onPress={submit} testID="otc-submit" />
        {mine.length > 0 && <Card style={{ gap: 0 }}>
          <Text weight="700" style={{ marginBottom: 6 }}>{t('ui.otcMine')}</Text>
          {mine.map((r, i) => (
            <View key={r.id}>{i > 0 && <Divider />}<Row style={{ paddingVertical: 10, gap: 8 }}>
              <Text size="small" style={{ flex: 1 }}>{t(r.side === 'buy' ? 'market.buy' : 'market.sell')} {r.asset} · {money(r.fiatAmount, r.fiat)}{'\n'}<Text size="tiny" tone="sub">{date(r.createdAt)}</Text></Text>
              <Badge label={t(`ui.otc_${r.status}`)} tone={r.status === 'open' ? 'warning' : r.status === 'contacted' ? 'success' : 'default'} />
            </Row></View>
          ))}
        </Card>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
