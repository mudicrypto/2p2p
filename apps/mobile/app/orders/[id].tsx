/** parley trade screen: buyer pays · seller confirms · dispute · done (mirrors the web order page). */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, biometricUnlock } from '../../src/native';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { cdp, orderState } from '../../src/format';
import { space } from '../../src/theme';
import { Avatar, Badge, Big, Button, Card, CopyRow, Divider, Hero, Input, Notice, Pill, Press, Row, Skeleton, Text, errText, success } from '../../src/ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return now;
}

export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c, me } = useApp();
  const { t, money, num, date } = useI18n();
  const now = useNow();
  const [o, setO] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [receipt, setReceipt] = useState<'idle' | 'busy' | 'done'>('idle');
  const scroll = useRef<{ scrollToEnd: () => void } | null>(null);
  const load = useCallback(async () => {
    const [x, m] = await Promise.all([api.order(id).catch(() => null), api.messages(id).catch(() => null)]);
    if (x) setO(x); if (m) setMsgs(m);
  }, [id]);
  useEffect(() => { void load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);
  if (!o) return <View style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 12 }}><Skeleton height={260} /><Skeleton height={220} /></View>;

  const buyer = o.role === 'buyer';
  const cp = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8) ?? '—';
  const fiatAmt = money(o.fiatAmount, o.fiat);
  const crypto = `${num(o.cryptoAmount, cdp(o.asset))} ${o.asset}`;
  const awaiting = o.status === 'AWAITING_PAYMENT' || o.status === 'CREATED';
  const left = o.expiresAt ? Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - now) / 1000)) : 0;
  const total = o.expiresAt ? Math.max(1, Math.floor((new Date(o.expiresAt).getTime() - new Date(o.createdAt).getTime()) / 1000)) : 1;
  const disputeIn = o.disputeAvailableAt ? Math.max(0, Math.floor((new Date(o.disputeAvailableAt).getTime() - now) / 1000)) : 0;
  const st = orderState(o, t, now);
  const showDispute = o.status === 'DISPUTED' || disputing;
  const act = async (name: string, f: () => Promise<unknown>) => { setBusy(name); setErr(null); try { setO(await f()); success(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(''); } };
  const uploadReceipt = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    setReceipt('busy');
    try { const up = await api.uploadAttachment(id, a.mimeType ?? 'image/jpeg', a.base64); await api.sendMessage(id, '', up.key); setReceipt('done'); success(); void load(); }
    catch (e) { setErr(errText(t, e)); setReceipt('idle'); }
  };
  const send = async () => {
    if (!text.trim()) return;
    try { const m = await api.sendMessage(id, text); setMsgs((x) => [...x.filter((y) => y.id !== m.id), m]); setText(''); setTimeout(() => scroll.current?.scrollToEnd(), 50); }
    catch (e) { setErr((e as { code?: string }).code === 'FORBIDDEN' ? t('chat.blocked') : errText(t, e)); }
  };

  let hero: React.ReactNode;
  if (showDispute) hero = <Hero tone="sell"><Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -1, textAlign: 'center', lineHeight: 34 }}>{t('ui.frozenNotLost')}</Text><Pill tone="sell" icon="lock-closed-outline" label={t('ui.heldInEscrow', { amount: crypto })} /></Hero>;
  else if (o.status === 'COMPLETED') hero = <Hero><Ionicons name="checkmark-circle" size={44} color={c.buy} /><Text weight="500">{t(buyer ? 'ui.releasedToWallet' : 'ui.tradeComplete')}</Text><Big size={64}>{buyer ? num(o.cryptoAmount, cdp(o.asset)) : num(o.fiatAmount, 2)}</Big><Pill label={buyer ? o.asset : o.fiat} /></Hero>;
  else if (o.status === 'CANCELLED') hero = <Hero><Text size="h2">{t('order.status.CANCELLED')}</Text><Text tone="sub" style={{ textAlign: 'center' }}>{t('ui.cancelledHint')}</Text></Hero>;
  else if (buyer && awaiting) hero = (
    <Hero>
      <Text weight="500">{t('ui.timeLeftToPay')}</Text>
      <Big size={92} tone={left < 120 ? 'sell' : undefined} testID="countdown">{mmss(left)}</Big>
      <Pill icon="lock-closed-outline" label={t('ui.inEscrow', { amount: crypto })} />
      <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: 'hidden', marginTop: space(2) }}><View style={{ height: 6, borderRadius: 3, width: `${(left / total) * 100}%`, backgroundColor: left < 120 ? c.sell : c.primary }} /></View>
      {left < 120 && <Text size="small" tone="sell" style={{ textAlign: 'center' }}>{t('ui.underTwoMin')}</Text>}
      <Button size="lg" title={t('ui.iveSent', { amount: fiatAmt })} loading={busy === 'paid'} onPress={() => act('paid', () => api.markPaid(id))} style={{ alignSelf: 'stretch', marginTop: space(2) }} testID="mark-paid" />
      <Text size="tiny" tone="sub" style={{ textAlign: 'center' }}>{t('order.confirmPaid', { amount: fiatAmt })}</Text>
    </Hero>
  );
  else if (buyer) hero = <Hero><Text weight="500">{t('ui.waitingFor', { name: cp })}</Text><Big size={72}>{num(o.cryptoAmount, cdp(o.asset))}</Big><Pill icon="lock-closed-outline" label={t('ui.inEscrow', { amount: crypto })} /><Text size="small" tone="sub" style={{ textAlign: 'center' }}>{t('ui.buyerWaiting')}</Text></Hero>;
  else if (awaiting) hero = <Hero><Text weight="500">{t('ui.waitingFor', { name: cp })}</Text><Big size={92}>{mmss(left)}</Big><Pill icon="lock-closed-outline" label={t('ui.staysLocked', { amount: crypto })} /></Hero>;
  else hero = <Hero tone="info"><Text weight="500">{t('ui.checkBankFor')}</Text><Big size={84}>{num(o.fiatAmount, 2)}</Big><Pill tone="info" icon="lock-closed-outline" label={t('ui.staysLocked', { amount: crypto })} /></Hero>;

  const steps = buyer
    ? [[t('ui.escrowLockedStep'), t('ui.escrowLockedHint', { amount: crypto })], [t('ui.youSend', { amount: fiatAmt }), t('ui.youSendHint')], [t('ui.sellerConfirms'), t('ui.sellerChecksHint')], [t('ui.releasedToYou', { asset: o.asset }), t('ui.releasedHint')]]
    : [[t('ui.escrowLockedStep'), t('ui.yourEscrowHint', { amount: crypto })], [t('ui.buyerSends', { amount: fiatAmt }), t('ui.buyerSendsHint')], [t('ui.youConfirm'), t('ui.confirmHint')], [t('ui.releasedToBuyer', { asset: o.asset }), t('ui.releasedHint')]];
  const stepIdx = awaiting ? 1 : o.status === 'PAID' || o.status === 'DISPUTED' ? 2 : o.status === 'COMPLETED' ? 4 : 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView ref={scroll as never} contentContainerStyle={{ padding: space(4), paddingTop: space(1), gap: space(3), paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text size="h2" style={{ flex: 1 }}>{showDispute ? t('order.dispute') : t(buyer ? 'ui.buyingX' : 'ui.sellingX', { amount: num(o.cryptoAmount, cdp(o.asset)), asset: o.asset })}</Text>
            <View testID="order-status"><Badge label={st.pill} tone={st.tone} /></View>
          </Row>
          <Text size="small" tone="sub">{t(buyer ? 'ui.fromX' : 'ui.toX', { name: cp })} · {t('ui.tradeRef')} {o.referenceCode}</Text>
        </View>

        {hero}
        {err && <Notice tone="error" text={err} />}

        {showDispute ? <DisputePanel o={o} onDone={() => { setDisputing(false); void load(); }} onCancel={() => setDisputing(false)} /> : <>
          {!buyer && o.status === 'PAID' && (
            <Card style={{ gap: space(3) }}>
              <Text size="small" tone="sub">{t('ui.stepNofM', { n: 3, m: 4 })}</Text>
              <Text size="h3">{t('ui.confirmOnlyAfter')}</Text>
              <Text tone="sub">{t('ui.openBankingApp')}</Text>
              <Row style={{ justifyContent: 'space-between' }}><Text weight="600">{t('ui.paymentShouldCome')}</Text>{(o.counterparty?.kycTier ?? 0) >= 1 && <Badge label={t('ui.idVerified')} tone="success" />}</Row>
              <Line label={t('ui.sender')} value={cp} />
              <Line label={t('order.amount')} value={fiatAmt} />
              <Line label={t('ui.reference')} value={o.referenceCode} />
              <Input label={t('order.totp')} keyboardType="number-pad" maxLength={6} value={totp} onChangeText={(v) => setTotp(v.replace(/\D/g, ''))} placeholder="••••••" style={{ letterSpacing: 8, textAlign: 'center', fontSize: 22 }} />
              <Button size="lg" title={t('ui.moneyReceived')} disabled={totp.length !== 6} loading={busy === 'release'} onPress={async () => { if (await biometricUnlock(t('order.release'))) await act('release', () => api.release(id, totp)); }} />
              {disputeIn > 0 ? <Text size="small" tone="sub" style={{ textAlign: 'center' }}>{t('order.disputeIn', { time: mmss(disputeIn) })}</Text>
                : <Press onPress={() => setDisputing(true)}><Text weight="600" style={{ textAlign: 'center', textDecorationLine: 'underline' }}>{t('ui.notReceived')}</Text></Press>}
            </Card>
          )}
          {buyer && ['AWAITING_PAYMENT', 'PAID'].includes(o.status) && (
            <Card style={{ gap: space(3) }}>
              <Button variant="soft" icon={receipt === 'done' ? 'checkmark-circle' : 'attach-outline'} title={receipt === 'done' ? t('ui.receiptSent') : t('ui.uploadReceipt')} loading={receipt === 'busy'} onPress={uploadReceipt} />
              {o.status === 'PAID' && (disputeIn > 0 ? <Text size="small" tone="sub" style={{ textAlign: 'center' }}>{t('order.disputeIn', { time: mmss(disputeIn) })}</Text>
                : <Press onPress={() => setDisputing(true)}><Text weight="600" style={{ textAlign: 'center', textDecorationLine: 'underline' }}>{t('ui.sellerNotReleased')}</Text></Press>)}
            </Card>
          )}
          {buyer && o.payee && awaiting && (
            <>
              <Card style={{ gap: 0 }}>
                <Row style={{ justifyContent: 'space-between' }}><Text size="h3">{t('order.payTo')}</Text><Text size="small" tone="sub">{o.payee.type}</Text></Row>
                <CopyRow label={t('ui.name')} value={o.payee.holderName} />
                {Object.entries(o.payee.details ?? {}).map(([k, v]) => <View key={k}><Divider /><CopyRow label={k} value={String(v)} mono /></View>)}
                <Divider /><CopyRow label={t('order.amount')} value={fiatAmt} />
                <Divider /><CopyRow label={t('ui.reference')} value={o.referenceCode} />
              </Card>
              <Text size="tiny" tone="sub" style={{ paddingHorizontal: space(4) }}>{t('ui.payOwnName')}</Text>
            </>
          )}
          {o.status === 'COMPLETED' && (fb ? <Notice tone="success" text={t('order.thanks')} /> : (
            <Card style={{ alignItems: 'center', gap: 12 }}>
              <Text weight="600" style={{ textAlign: 'center' }}>{t('ui.howWasTrade', { name: cp })}</Text>
              <Row><Button variant="ink" icon="thumbs-up" title={t('order.positive')} onPress={async () => { await api.feedback(id, true).catch(() => null); setFb(true); }} />
                <Button variant="soft" icon="thumbs-down" title={t('order.negative')} onPress={async () => { await api.feedback(id, false).catch(() => null); setFb(true); }} /></Row>
            </Card>))}
          <Card style={{ gap: space(3) }}>
            <Text size="h3">{t('ui.progress')}</Text>
            {steps.map(([title, hint], i) => {
              const done = i < stepIdx; const cur = i === stepIdx && o.status !== 'COMPLETED';
              return (
                <Row key={title} style={{ alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ marginTop: 5, width: 12, height: 12, borderRadius: 6, backgroundColor: done ? c.buy : cur ? c.primary : c.muted }} />
                  <View style={{ flex: 1 }}><Text weight="500" tone={done || cur ? 'default' : 'sub'}>{title}</Text><Text size="small" tone="sub">{hint}</Text></View>
                  <Text size="tiny" weight="600">{done ? t('ui.done') : cur ? t('ui.now') : ''}</Text>
                </Row>
              );
            })}
            {buyer && awaiting && <Press onPress={() => act('cancel', () => api.cancel(id))}><Text size="small" tone="sub" style={{ textDecorationLine: 'underline' }}>{t('order.cancel')}</Text></Press>}
          </Card>
        </>}

        {/* Chat */}
        <Card style={{ gap: space(3), padding: 0, overflow: 'hidden' }}>
          <Row style={{ padding: space(4), paddingBottom: 0 }}><Press onPress={() => o.counterparty?.id && router.push(`/profile/${o.counterparty.id}`)}><Avatar name={cp} seed={o.counterparty?.id} size={34} online /></Press><View style={{ flex: 1 }}><Text weight="600">{cp}</Text><Text size="tiny" tone="sub">{t('chat.title')}</Text></View></Row>
          <Row style={{ paddingHorizontal: space(4), alignItems: 'flex-start' }}><Ionicons name="shield-half-outline" size={14} color={c.sub} /><Text size="tiny" tone="sub" style={{ flex: 1 }}>{t('ui.chatSafety')}</Text></Row>
          <View style={{ paddingHorizontal: space(4), gap: 8 }}>
            {msgs.map((m) => {
              const mine = m.senderId === me?.id;
              if (!m.senderId) return <Text key={m.id} size="tiny" tone="sub" style={{ textAlign: 'center' }}>{m.body}</Text>;
              const fg = mine ? c.onInk : c.text;
              return (
                <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mine ? c.ink : c.muted, borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, paddingHorizontal: 14, paddingVertical: 9 }}>
                  {!!m.body && <Text style={{ color: fg }}>{m.body}</Text>}
                  {!!m.attachmentKey && <Row style={{ gap: 4 }}><Ionicons name="document-attach" size={14} color={fg} /><Text size="small" style={{ color: fg }}>{t('chat.attach')}</Text></Row>}
                  <Text size="tiny" style={{ color: fg, opacity: 0.6, textAlign: 'right', marginTop: 2 }}>{date(m.createdAt)}</Text>
                </View>
              );
            })}
          </View>
          <Row style={{ borderTopWidth: 1, borderTopColor: c.border, padding: space(3) }}>
            <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={c.sub} onSubmitEditing={send} returnKeyType="send"
              style={{ flex: 1, height: 46, backgroundColor: c.muted, borderRadius: 23, paddingHorizontal: 16, color: c.text }} />
            <Button size="sm" variant="ink" title="" icon="arrow-up" onPress={send} disabled={!text.trim()} style={{ width: 46 }} />
          </Row>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: space(3) }}><Divider /><Row style={{ justifyContent: 'space-between' }}><Text tone="sub">{label}</Text><Text weight="600">{value}</Text></Row></View>;
}

const REASONS_BUYER = [['not_released', 'ui.rPaidNotReleased'], ['fraud', 'ui.rDifferentAccount'], ['wrong_amount', 'ui.rSentWrong'], ['other', 'ui.rOther']] as const;
const REASONS_SELLER = [['not_paid', 'ui.rNotPaid'], ['third_party_payment', 'ui.rThirdParty'], ['wrong_amount', 'ui.rWrongAmount'], ['other', 'ui.rOther']] as const;
async function pickImage(orderId: string) {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
  const a = r.canceled ? null : r.assets[0];
  if (!a?.base64) return null;
  return (await api.uploadAttachment(orderId, a.mimeType ?? 'image/jpeg', a.base64)).key;
}
/** Open a dispute (what went wrong, evidence) or follow an open one. */
function DisputePanel({ o, onDone, onCancel }: { o: any; onDone: () => void; onCancel: () => void }) {
  const { colors: c } = useApp();
  const { t, date } = useI18n();
  const reasons = o.role === 'buyer' ? REASONS_BUYER : REASONS_SELLER;
  const [d, setD] = useState<any>(null);
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const disputed = o.status === 'DISPUTED';
  useEffect(() => { if (disputed) api.dispute(o.id).then(setD).catch(() => null); }, [disputed, o.id]);
  const label = (r: string) => t([...REASONS_BUYER, ...REASONS_SELLER].find(([v]) => v === r)?.[1] ?? 'ui.rOther');
  if (disputed) return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}><Text size="h3">{t('ui.disputeOpen')}</Text>{d && <Badge label={d.status} tone="danger" />}</Row>
      {d && <Text>{t('ui.reason')}: {label(d.reason)}</Text>}
      {d?.slaDueAt && <Text size="small" tone="sub">{t('ui.arbiterBy', { time: date(d.slaDueAt) })}</Text>}
      {d && <Text size="small" tone="sub">{t('ui.evidence')}: {d.evidence?.length ?? 0}</Text>}
      {d?.decisionNote && <Notice text={d.decisionNote} />}
      {d && !d.resolvedAt && <Button variant="soft" icon="attach" title={t('ui.addEvidence')} onPress={async () => { const k = await pickImage(o.id).catch(() => null); if (k) { await api.addEvidence(d.id, k).catch(() => null); api.dispute(o.id).then(setD).catch(() => null); } }} />}
    </Card>
  );
  return (
    <View style={{ gap: space(3) }}>
      <Card style={{ gap: 0 }}>
        <Text weight="600" style={{ marginBottom: space(1) }}>{t('ui.whatWentWrong')}</Text>
        {reasons.map(([v, k], i) => (
          <View key={v}>{i > 0 && <Divider />}
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: reason === v }} onPress={() => setReason(v)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 }}>
              <Text style={{ flex: 1 }}>{t(k)}</Text>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: reason === v ? c.sell : c.border, alignItems: 'center', justifyContent: 'center' }}>{reason === v && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.sell }} />}</View>
            </Pressable>
          </View>
        ))}
        <View style={{ marginTop: space(2) }}><Input placeholder={t('ui.describe')} multiline value={note} onChangeText={setNote} maxLength={4000} style={{ height: 90, textAlignVertical: 'top', paddingTop: 12 }} /></View>
      </Card>
      <Card style={{ gap: 0 }}>
        <Text weight="600">{t('ui.evidence')}</Text>
        <Row style={{ justifyContent: 'space-between', paddingVertical: space(3) }}><Text>{t('ui.bankReceipt')}{keys.length ? ` (${keys.length})` : ''}</Text><Button size="sm" variant="soft" title={t('ui.upload')} onPress={async () => { try { const k = await pickImage(o.id); if (k) setKeys((x) => [...x, k]); } catch (e) { setErr(errText(t, e)); } }} /></Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between', paddingVertical: space(3) }}><Text>{t('ui.chatAttached')}</Text><Ionicons name="checkmark" size={18} color={c.buy} /></Row>
      </Card>
      <Text size="tiny" tone="sub" style={{ paddingHorizontal: space(4) }}>{t('ui.disputeHint')}</Text>
      {err && <Notice tone="error" text={err} />}
      <Button size="lg" variant="sell" title={t('ui.submitDispute')} loading={busy} disabled={!note.trim() || keys.length === 0} onPress={async () => {
        setBusy(true); setErr(null);
        try { await api.openDispute(o.id, { reason, note, evidenceKeys: keys }); success(); onDone(); } catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
      }} />
      <Press onPress={onCancel}><Text size="small" tone="sub" style={{ textAlign: 'center', textDecorationLine: 'underline' }}>{t('common.back')}</Text></Press>
    </View>
  );
}
