/** Seller-side safety (mobile): buyer risk signals, receipt checks, payer-name confirmation. */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from './native';
import { useApp } from './app';
import { useI18n } from './i18n';
import { Card, Row, Text } from './ui';

export function BuyerSignals({ signals }: { signals?: string[] }) {
  const { colors: c } = useApp();
  const { t } = useI18n();
  if (!signals?.length) return null;
  return (
    <View testID="buyer-signals" style={{ gap: 4, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.warn, backgroundColor: `${c.warn}1a` }}>
      <Row style={{ gap: 6 }}><Ionicons name="warning-outline" size={16} color={c.warn} /><Text size="small" weight="700">{t('ui.signalsTitle')}</Text></Row>
      {signals.map((s) => <Text key={s} size="small" tone="sub">• {t(`ui.signal_${s}`)}</Text>)}
    </View>
  );
}

export function ReceiptChecks({ orderId }: { orderId: string }) {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [r, setR] = useState<Awaited<ReturnType<typeof api.receiptChecks>> | null>(null);
  useEffect(() => { const load = () => api.receiptChecks(orderId).then(setR).catch(() => null); void load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [orderId]);
  if (!r?.receipts.length) return null;
  return (
    <Card style={{ gap: 6 }} testID="receipt-checks">
      <Row style={{ gap: 6 }}><Ionicons name="document-text-outline" size={16} color={c.text} /><Text size="small" weight="700">{t('ui.receiptChecks')}</Text></Row>
      {r.receipts.map((x, i) => (
        <View key={x.fileKey} style={{ gap: 2 }}>
          <Text size="tiny" tone="sub">{t('ui.receiptN', { n: i + 1 })}</Text>
          {x.flags.length === 0 ? <Text size="small" tone="buy">✓ {t('ui.receiptClean')}</Text>
            : x.flags.map((f) => <Text key={f} size="small" tone="sell">⚠ {t(`ui.rflag_${f.startsWith('edited:') ? 'edited' : f}`, { tool: f.split(':')[1] ?? '' })}</Text>)}
        </View>
      ))}
      <Text size="tiny" tone="sub">{r.automaticReading ? t('ui.receiptNoteAi') : t('ui.receiptNote')}</Text>
    </Card>
  );
}
