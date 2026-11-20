/** Safe-to-pay checklist, dispute progress and trust score (mobile). */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from './app';
import { useI18n } from './i18n';
import { Button, Card, Row, Text } from './ui';

const SAFE = ['ui.safe1', 'ui.safe2', 'ui.safe3', 'ui.safe4'];
export function SafePayChecklist({ amount, holder, busy, onConfirm, onCancel }: { amount: string; holder?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [ok, setOk] = useState(SAFE.map(() => false));
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }} testID="safe-pay">
      <Row style={{ gap: 6 }}><Ionicons name="shield-checkmark" size={18} color={c.primary} /><Text weight="700">{t('ui.safeTitle')}</Text></Row>
      <Text size="small" tone="sub">{t('ui.safeIntro')}</Text>
      {SAFE.map((k, i) => (
        <Pressable key={k} testID={`safe-${i}`} accessibilityRole="checkbox" accessibilityState={{ checked: ok[i] }} onPress={() => setOk(ok.map((v, j) => (j === i ? !v : v)))}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: ok[i] ? c.primary : c.border, backgroundColor: ok[i] ? `${c.primary}1a` : 'transparent' }}>
          <Ionicons name={ok[i] ? 'checkbox' : 'square-outline'} size={20} color={ok[i] ? c.primary : c.sub} />
          <Text size="small" style={{ flex: 1 }}>{t(k, { amount, holder: holder ?? '' })}</Text>
        </Pressable>
      ))}
      <Button size="lg" title={t('ui.safeConfirm')} disabled={!ok.every(Boolean)} loading={busy} onPress={onConfirm} testID="safe-confirm" />
      <Button variant="ghost" title={t('common.cancel')} onPress={onCancel} />
    </View>
  );
}

export function DisputeProgress({ d }: { d: any }) {
  const { colors: c } = useApp();
  const { t, date } = useI18n();
  const steps = [
    { label: t('ui.dStepOpened'), done: true, at: d.createdAt },
    { label: t('ui.dStepEvidence', { n: d.evidence?.length ?? 0 }), done: (d.evidence?.length ?? 0) > 0 },
    { label: d.escalatedAt ? t('ui.dStepEscalated') : t('ui.dStepReview'), done: d.arbiterAssigned || !!d.escalatedAt || !!d.resolvedAt, at: d.escalatedAt },
    { label: t('ui.dStepDecision'), done: !!d.resolvedAt, at: d.resolvedAt },
  ];
  const cur = steps.findIndex((s) => !s.done);
  return (
    <View testID="dispute-progress" style={{ gap: 8 }}>
      {steps.map((s, i) => (
        <Row key={i} style={{ gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? c.buy : i === cur ? c.primary : c.muted }}>
            {s.done ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text size="tiny" weight="700" style={{ color: i === cur ? c.onPrimary : c.sub }}>{i + 1}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text size="small" weight={i === cur ? '700' : '400'}>{s.label}</Text>
            {!!s.at && <Text size="tiny" tone="sub">{date(s.at)}</Text>}
            {i === cur && i === 2 && !!d.slaDueAt && !d.escalatedAt && <Text size="tiny" tone="sub">{t('ui.arbiterBy', { time: date(d.slaDueAt) })}</Text>}
          </View>
        </Row>
      ))}
    </View>
  );
}

const MAX: Record<string, number> = { history: 25, completion: 20, feedback: 15, age: 15, verification: 15, disputes: 10 };
export function TrustCard({ trust }: { trust: { score: number; level: string; parts: Record<string, number>; penalty: number } }) {
  const { colors: c } = useApp();
  const { t } = useI18n();
  return (
    <Card style={{ gap: 8 }} testID="trust">
      <Row style={{ justifyContent: 'space-between' }}><Text size="small" tone="sub">{t('ui.trustScore')}</Text><Text size="small" weight="700" tone={trust.level === 'fair' ? 'warn' : trust.level === 'new' ? 'sub' : 'buy'}>{t(`ui.trust_${trust.level}`)}</Text></Row>
      <Text size="h1" testID="trust-score">{trust.score}<Text tone="sub">/100</Text></Text>
      {Object.keys(MAX).map((p) => (
        <View key={p} style={{ gap: 3 }}>
          <Row style={{ justifyContent: 'space-between' }}><Text size="tiny" tone="sub">{t(`ui.trustPart_${p}`)}</Text><Text size="tiny">{trust.parts[p] ?? 0}/{MAX[p]}</Text></Row>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: c.muted, overflow: 'hidden' }}><View style={{ height: 4, width: `${((trust.parts[p] ?? 0) / MAX[p]) * 100}%`, backgroundColor: c.primary }} /></View>
        </View>
      ))}
      {trust.penalty > 0 && <Text size="tiny" tone="sell">{t('ui.trustPenalty', { n: trust.penalty })}</Text>}
    </Card>
  );
}
