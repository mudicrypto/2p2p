/** Counterparty conditions + auto-reply fields (Post ad and Edit ad), and the requirements box shown before trading. */
import { View } from 'react-native';
import { useI18n } from './i18n';
import { Card, Input, Row, Text } from './ui';

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
