import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, biometricUnlock } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { radius, space } from '../../src/theme';
import { AssetIcon, Avatar, Badge, Button, Card, CopyRow, Divider, Input, Notice, PayChip, PickerChip, Press, Row, Skeleton, Steps, Text, errText, success } from '../../src/ui';

const tone = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'default' : s === 'DISPUTED' ? 'danger' : 'warning') as 'success' | 'default' | 'danger' | 'warning';
function useCountdown(to?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!to) return null;
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return { s, text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
}

export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c, me } = useApp();
  const { t, money, num, date } = useI18n();
  const [o, setO] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState(false);
  const [receipt, setReceipt] = useState<'idle' | 'busy' | 'done'>('idle');
  const uploadReceipt = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    setReceipt('busy');
    try { const up = await api.uploadAttachment(id, a.mimeType ?? 'image/jpeg', a.base64); await api.sendMessage(id, '', up.key); setReceipt('done'); success(); void load(); }
    catch (e) { setErr(errText(t, e)); setReceipt('idle'); }
  };
  const scroll = useRef<{ scrollToEnd: () => void } | null>(null);
  const load = useCallback(async () => {
    const [x, m] = await Promise.all([api.order(id).catch(() => null), api.messages(id).catch(() => null)]);
    if (x) setO(x); if (m) setMsgs(m);
  }, [id]);
  useEffect(() => { void load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);
  const left = useCountdown(o?.status === 'AWAITING_PAYMENT' ? o.expiresAt : null);
  const disputeIn = useCountdown(o?.status === 'PAID' ? o.disputeAvailableAt : null);
  if (!o) return <View style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 12 }}><Skeleton height={160} /><Skeleton height={220} /></View>;
  const buyer = o.role === 'buyer';
  const act = async (name: string, f: () => Promise<unknown>) => { setBusy(name); setErr(null); try { setO(await f()); success(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(''); } };
  const step = ['AWAITING_PAYMENT', 'CREATED'].includes(o.status) ? 1 : ['PAID', 'DISPUTED'].includes(o.status) ? 2 : o.status === 'COMPLETED' ? 4 : 1;
  const headline = o.status === 'COMPLETED' || o.status === 'CANCELLED' || o.status === 'DISPUTED' ? t(`order.status.${o.status}`)
    : buyer ? (o.status === 'PAID' ? t('ui.waitSeller') : t('ui.payWithin')) : (o.status === 'PAID' ? t('ui.checkPayment') : t('ui.waitBuyer'));
  const cp = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8) ?? '';
  const send = async () => {
    if (!text.trim()) return;
    try { const m = await api.sendMessage(id, text); setMsgs((x) => [...x.filter((y) => y.id !== m.id), m]); setText(''); setTimeout(() => scroll.current?.scrollToEnd(), 50); }
    catch (e) { setErr((e as { code?: string }).code === 'FORBIDDEN' ? t('chat.blocked') : errText(t, e)); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `#${o.id.slice(0, 8)}` }} />
      <ScrollView ref={scroll as never} contentContainerStyle={{ padding: space(4), gap: space(4), paddingBottom: space(6) }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space(4) }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <AssetIcon asset={o.asset} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text size="tiny" tone="sub">{t(`order.role.${o.role}`)} · {o.asset}</Text>
              <Text size="h3">{headline}</Text>
              <Badge label={t(`order.status.${o.status}`)} tone={tone(o.status)} />
            </View>
            {left && <View style={{ alignItems: 'center', backgroundColor: c.muted, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}><Text size="tiny" tone="sub">{t('order.timeLeft')}</Text><Text size="h3" tone={left.s < 120 ? 'sell' : 'default'}>{left.text}</Text></View>}
          </Row>
          <Steps steps={[t('ui.stepCreated'), t('ui.stepAwaiting'), t('ui.stepVerify'), t('ui.stepReleaseCrypto')]} current={step} failed={['DISPUTED', 'CANCELLED'].includes(o.status)} />
        </Card>

        <Card style={{ gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View><Text size="tiny" tone="sub">{t('order.amount')}</Text><Text size="h2">{money(o.fiatAmount, o.fiat)}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text size="tiny" tone="sub">{buyer ? t('trade.youReceive') : t('trade.youSell')}</Text><Text weight="700">{num(o.cryptoAmount)} {o.asset}</Text></View>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('order.price')}</Text><Text size="small" weight="600">{money(o.price, o.fiat)}</Text></Row>
          <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('order.fee')}</Text><Text size="small" weight="600">{num(o.fee)} {o.asset}</Text></Row>
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: `${c.primary}10` }}>
            <CopyRow label={t('order.reference')} value={o.referenceCode} mono />
          </View>
        </Card>

        {o.payee && (
          <Card style={{ gap: 0 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}><Text weight="700">{t('order.payTo')}</Text><PayChip code={o.payee.type} /></Row>
            <CopyRow label={t('order.holder')} value={o.payee.holderName} />
            {Object.entries(o.payee.details ?? {}).map(([k, v]) => <View key={k}><Divider /><CopyRow label={k} value={String(v)} mono /></View>)}
          </Card>
        )}

        {err && <Notice tone="error" text={err} />}
        {buyer && o.status === 'AWAITING_PAYMENT' && <View style={{ gap: 10 }}>
          <Notice tone="warn" text={t('order.confirmPaid', { amount: money(o.fiatAmount, o.fiat) })} />
          <Button size="lg" variant="buy" icon="checkmark-circle" title={t('order.markPaid')} loading={busy === 'paid'} onPress={() => act('paid', () => api.markPaid(id))} testID="mark-paid" />
          <Button variant="outline" title={t('order.cancel')} loading={busy === 'cancel'} onPress={() => act('cancel', () => api.cancel(id))} />
        </View>}
        {buyer && ['AWAITING_PAYMENT', 'PAID'].includes(o.status) && <Button variant="outline" icon={receipt === 'done' ? 'checkmark-circle' : 'cloud-upload-outline'} title={receipt === 'done' ? t('ui.receiptSent') : t('ui.uploadReceipt')} loading={receipt === 'busy'} onPress={uploadReceipt} />}
        {!buyer && o.status === 'AWAITING_PAYMENT' && <Notice text={t('ui.sellerWaiting')} />}
        {buyer && o.status === 'PAID' && <Notice text={t('ui.buyerWaiting')} />}
        {!buyer && o.status === 'PAID' && <View style={{ gap: 10 }}>
          <Notice tone="warn" text={t('order.releaseHint')} />
          <Input label={t('order.totp')} keyboardType="number-pad" maxLength={6} value={totp} onChangeText={(v) => setTotp(v.replace(/\D/g, ''))} placeholder="••••••" style={{ letterSpacing: 8, textAlign: 'center', fontSize: 22 }} />
          <Button size="lg" variant="sell" icon="lock-open" title={t('order.release')} disabled={totp.length !== 6} loading={busy === 'release'} onPress={async () => { if (await biometricUnlock(t('order.release'))) await act('release', () => api.release(id, totp)); }} />
        </View>}
        {o.status === 'PAID' && disputeIn && disputeIn.s > 0 && <Text size="tiny" tone="sub" style={{ textAlign: 'center' }}>{t('order.disputeIn', { time: disputeIn.text })}</Text>}
        {(o.status === 'DISPUTED' || (o.status === 'PAID' && disputeIn?.s === 0)) && <DisputePanel orderId={id} disputed={o.status === 'DISPUTED'} onChange={load} />}
        {o.status === 'COMPLETED' && (fb ? <Notice tone="success" text={t('order.thanks')} /> : (
          <Card style={{ alignItems: 'center', gap: 12 }}>
            <Ionicons name="checkmark-circle" size={44} color={c.buy} />
            <Text weight="700">{t('order.feedback')}</Text>
            <Row><Button variant="soft" icon="thumbs-up" title={t('order.positive')} onPress={async () => { await api.feedback(id, true).catch(() => null); setFb(true); }} />
              <Button variant="outline" icon="thumbs-down" title={t('order.negative')} onPress={async () => { await api.feedback(id, false).catch(() => null); setFb(true); }} /></Row>
          </Card>))}

        {/* Chat */}
        <Card style={{ gap: space(3), padding: 0, overflow: 'hidden' }}>
          <Row style={{ padding: space(4), paddingBottom: 0 }}><Press onPress={() => o.counterparty?.id && router.push(`/profile/${o.counterparty.id}`)}><Avatar name={cp} seed={o.counterparty?.id} size={32} online /></Press><View style={{ flex: 1 }}><Text weight="700">{cp}</Text><Text size="tiny" tone="sub">{t('chat.title')}</Text></View></Row>
          <View style={{ marginHorizontal: space(4) }}><Notice tone="warn" icon="shield-half" text={t('ui.chatSafety')} /></View>
          <View style={{ paddingHorizontal: space(4), gap: 8 }}>
            {msgs.map((m) => {
              const mine = m.senderId === me?.id;
              if (!m.senderId) return <Text key={m.id} size="tiny" tone="sub" style={{ textAlign: 'center' }}>{m.body}</Text>;
              return (
                <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mine ? c.primary : c.muted, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, paddingHorizontal: 14, paddingVertical: 8 }}>
                  {!!m.body && <Text style={{ color: mine ? '#fff' : c.text }}>{m.body}</Text>}
                  {!!m.attachmentKey && <Row style={{ gap: 4 }}><Ionicons name="document-attach" size={14} color={mine ? '#fff' : c.text} /><Text size="small" style={{ color: mine ? '#fff' : c.text }}>{t('chat.attach')}</Text></Row>}
                  <Text size="tiny" style={{ color: mine ? 'rgba(255,255,255,0.7)' : c.sub, textAlign: 'right', marginTop: 2 }}>{date(m.createdAt)}</Text>
                </View>
              );
            })}
          </View>
          <Row style={{ borderTopWidth: 1, borderTopColor: c.border, padding: space(3) }}>
            <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={c.sub} onSubmitEditing={send} returnKeyType="send"
              style={{ flex: 1, height: 44, backgroundColor: c.muted, borderRadius: 22, paddingHorizontal: 16, color: c.text }} />
            <Button size="sm" title="" icon="send" onPress={send} disabled={!text.trim()} style={{ width: 44 }} />
          </Row>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const REASONS = [['not_paid', 'ui.rNotPaid'], ['not_released', 'ui.rNotReleased'], ['wrong_amount', 'ui.rWrongAmount'], ['other', 'ui.rOther']] as const;
async function pickImage(orderId: string) {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
  const a = r.canceled ? null : r.assets[0];
  if (!a?.base64) return null;
  return (await api.uploadAttachment(orderId, a.mimeType ?? 'image/jpeg', a.base64)).key;
}
/** Open a dispute (reason, description, evidence) or follow an open one. */
function DisputePanel({ orderId, disputed, onChange }: { orderId: string; disputed: boolean; onChange: () => void }) {
  const { colors: c } = useApp();
  const { t, date } = useI18n();
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('not_released');
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (disputed) api.dispute(orderId).then(setD).catch(() => null); }, [disputed, orderId]);
  const addFile = async () => { try { const k = await pickImage(orderId); if (k) setKeys((x) => [...x, k]); } catch (e) { setErr(errText(t, e)); } };
  if (disputed) return (
    <Card style={{ gap: 8, borderColor: `${c.sell}66` }}>
      <Row style={{ justifyContent: 'space-between' }}><Row><Ionicons name="hammer" size={18} color={c.sell} /><Text weight="700">{t('order.status.DISPUTED')}</Text></Row>{d && <Badge label={d.status} tone="danger" />}</Row>
      {d && <Text size="small">{t('ui.reason')}: {t(REASONS.find(([v]) => v === d.reason)?.[1] ?? 'ui.rOther')}</Text>}
      {d?.slaDueAt && <Text size="tiny" tone="sub">{t('ui.arbiterBy', { time: date(d.slaDueAt) })}</Text>}
      {d && <Text size="tiny" tone="sub">{t('ui.evidence')}: {d.evidence?.length ?? 0}</Text>}
      {d?.decisionNote && <Notice text={d.decisionNote} />}
      {d && !d.resolvedAt && <Button size="sm" variant="outline" icon="attach" title={t('ui.evidence')} onPress={async () => { const k = await pickImage(orderId).catch(() => null); if (k) { await api.addEvidence(d.id, k).catch(() => null); api.dispute(orderId).then(setD).catch(() => null); } }} />}
    </Card>
  );
  if (!open) return <Button variant="outline" icon="hammer-outline" title={t('order.dispute')} onPress={() => setOpen(true)} style={{ borderColor: `${c.sell}88` }} />;
  return (
    <Card style={{ gap: 10, borderColor: `${c.sell}66` }}>
      <Text weight="700">{t('order.dispute')}</Text>
      <Notice tone="warn" text={t('ui.disputeHint')} />
      <PickerChip fixed label={t(REASONS.find(([v]) => v === reason)![1])} value={reason} options={REASONS.map(([v, k]) => ({ value: v, label: t(k) }))} onChange={setReason} title={t('ui.reason')} />
      <Input label={t('ui.describe')} multiline value={note} onChangeText={setNote} maxLength={4000} style={{ height: 90, textAlignVertical: 'top', paddingTop: 12 }} />
      <Button variant="soft" size="sm" icon="image-outline" title={`${t('ui.evidence')} (${keys.length})`} onPress={addFile} />
      {err && <Notice tone="error" text={err} />}
      <Button variant="sell" title={t('ui.submit')} loading={busy} disabled={!note.trim() || keys.length === 0} onPress={async () => {
        setBusy(true); setErr(null);
        try { await api.openDispute(orderId, { reason, note, evidenceKeys: keys }); success(); onChange(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
      }} />
    </Card>
  );
}
