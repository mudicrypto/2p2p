import { useEffect, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { ASSETS, NETWORKS, radius, space } from '../src/theme';
import { AssetIcon, Button, Card, Chip, CopyRow, Notice, Row, Screen, Skeleton, Text, errText } from '../src/ui';

export default function Deposit() {
  const { colors: c } = useApp();
  const { t } = useI18n();
  const [asset, setAsset] = useState('USDT');
  const [network, setNetwork] = useState(NETWORKS.USDT[0]);
  const [addr, setAddr] = useState<{ address: string; memo?: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setAddr(null); setErr(null); api.depositAddress(asset, network).then(setAddr).catch((e) => setErr(errText(t, e))); }, [asset, network, t]);
  return (
    <Screen>
      <Row style={{ gap: 8 }}>{ASSETS.map((a) => <Chip key={a} label={a} active={asset === a} left={<AssetIcon asset={a} size={18} />} onPress={() => { setAsset(a); setNetwork(NETWORKS[a][0]); }} />)}</Row>
      <View style={{ gap: 6 }}><Text size="small" tone="sub" weight="500">{t('ui.network')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{NETWORKS[asset].map((n) => <Chip key={n} label={n} active={network === n} onPress={() => setNetwork(n)} />)}</ScrollView></View>
      <Card style={{ alignItems: 'center', gap: space(4) }}>
        {addr ? <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.lg }}><QRCode value={addr.address} size={200} color="#0b0d12" backgroundColor="#fff" /></View> : <Skeleton height={224} style={{ width: 224 }} />}
        <View style={{ alignSelf: 'stretch', backgroundColor: c.muted, borderRadius: radius.md, paddingHorizontal: 12 }}>{addr && <CopyRow label={t('ui.address')} value={addr.address} mono />}</View>
        {addr?.memo && <View style={{ alignSelf: 'stretch', backgroundColor: `${c.warn}1a`, borderRadius: radius.md, paddingHorizontal: 12 }}><CopyRow label="Memo" value={addr.memo} mono /></View>}
      </Card>
      <Notice tone="warn" text={t('ui.depositNote', { asset, network })} />
      {err && <Notice tone="error" text={err} />}
      {addr && <Button variant="outline" icon="share-outline" title={t('ui.address')} onPress={() => void Share.share({ message: addr.address })} />}
    </Screen>
  );
}
