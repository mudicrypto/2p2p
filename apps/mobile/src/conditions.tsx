/** Counterparty conditions + auto-reply fields (Post ad and Edit ad), and the requirements box shown before trading. */
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useI18n } from './i18n';
import { Button, Card, Chip, Input, Notice, Row, Text, errText } from './ui';

export type Conditions = { minAccountAgeDays: string; minCompletedTrades: string; autoReply: string };
export const emptyConditions: Conditions = { minAccountAgeDays: '', minCompletedTrades: '', autoReply: '' };
export const conditionsOf = (ad: any): Conditions => ({ minAccountAgeDays: ad.minAccountAgeDays ? String(ad.minAccountAgeDays) : '', minCompletedTrades: ad.minCompletedTrades ? String(ad.minCompletedTrades) : '', autoReply: ad.autoReply ?? '' });
export const conditionsBody = (c: Conditions) => ({ minAccountAgeDays: Number(c.minAccountAgeDays || 0), minCompletedTrades: Number(c.minCompletedTrades || 0), autoReply: c.autoReply.trim() });
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

export function ConditionsFields({ value, onChange }: { value: Conditions; onChange: (v: Conditions) => void }) {
  const { t } = useI18n();
  return (
    <Card style={{ gap: 12 }}>
      <Text weight="700">{t('ui.conditions')}</Text>
      <Row style={{ gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Input label={t('ui.minAccountAge')} keyboardType="number-pad" placeholder="0" value={value.minAccountAgeDays} onChangeText={(v) => onChange({ ...value, minAccountAgeDays: digits(v) })} testID="min-age" /></View>
        <View style={{ flex: 1 }}><Input label={t('ui.minTrades')} keyboardType="number-pad" placeholder="0" value={value.minCompletedTrades} onChangeText={(v) => onChange({ ...value, minCompletedTrades: digits(v) })} testID="min-trades" /></View>
      </Row>
      <Input label={t('ui.autoReply')} hint={t('ui.autoReplyHint')} value={value.autoReply} onChangeText={(v) => onChange({ ...value, autoReply: v })} multiline maxLength={500} style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} testID="auto-reply" />
    </Card>
  );
}

export function Requirements({ ad }: { ad: any }) {
  const { t } = useI18n();
  const items = [
    ad?.minCounterpartyTier > 0 && t('ui.reqTier', { n: ad.minCounterpartyTier }),
    ad?.minAccountAgeDays > 0 && t('ui.reqAge', { n: ad.minAccountAgeDays }),
    ad?.minCompletedTrades > 0 && t('ui.reqTrades', { n: ad.minCompletedTrades }),
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <Card style={{ gap: 4 }} testID="requirements">
      <Text size="small" weight="700">{t('ui.requirements')}</Text>
      {items.map((x) => <Text key={x} size="small" tone="sub">• {x}</Text>)}
    </Card>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const dayName = (locale: string, d: number) => { try { return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d))); } catch { return String(d); } };
const hhmm = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };

/** Merchant business hours: ads only show inside these hours. */
export function BusinessHoursCard({ me, locale, onSaved, save }: { me: any; locale: string; onSaved: () => Promise<void>; save: (hours: any) => Promise<unknown> }) {
  const { t } = useI18n();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const cur = me?.businessHours ?? null;
  const [on, setOn] = useState(!!cur);
  const [h, setH] = useState(cur ?? { tz, start: '09:00', end: '21:00', days: [1, 2, 3, 4, 5] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (hours: any) => { setMsg(null); try { await save(hours); await onSaved(); setMsg({ ok: true, text: '✓' }); } catch (e) { setMsg({ ok: false, text: errText(t, e) }); } };
  return (
    <Card style={{ gap: 10 }} testID="hours-card">
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}><Text weight="700">{t('ui.businessHours')}</Text><Text size="small" tone="sub">{t('ui.businessHoursDesc', { tz: h.tz })}</Text></View>
        <Switch value={on} onValueChange={(v) => { setOn(v); if (!v && cur) void run(null); }} testID="hours-on" />
      </Row>
      {me?.offHours && <Notice tone="warn" text={t('ui.hoursOffNow')} />}
      {on && <>
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}><Input label={t('ui.opensAt')} keyboardType="number-pad" placeholder="09:00" value={h.start} onChangeText={(v) => setH({ ...h, start: hhmm(v) })} /></View>
          <View style={{ flex: 1 }}><Input label={t('ui.closesAt')} keyboardType="number-pad" placeholder="21:00" value={h.end} onChangeText={(v) => setH({ ...h, end: hhmm(v) })} /></View>
        </Row>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>{DAYS.map((d) => <Chip key={d} label={dayName(locale, d)} active={h.days.includes(d)} onPress={() => setH({ ...h, days: h.days.includes(d) ? h.days.filter((x: number) => x !== d) : [...h.days, d] })} />)}</Row>
        <Button size="sm" title={t('common.save')} disabled={!h.days.length} onPress={() => run(h)} testID="hours-save" />
      </>}
      {msg && <Notice tone={msg.ok ? 'success' : 'error'} text={msg.text} />}
    </Card>
  );
}
