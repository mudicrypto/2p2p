import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Button, Card, Chip, Divider, Input, Notice, Press, Row, Screen, Text, errText, success } from '../src/ui';

/** Nickname, anti-phishing code, price alerts, followed and blocked traders. */
export default function TradingProfile() {
  const { colors: c, me, refresh } = useApp();
  const { t } = useI18n();
  const [nick, setNick] = useState(me?.displayName ?? '');
  const [apc, setApc] = useState('');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [rel, setRel] = useState<{ following: any[]; blocked: any[] }>({ following: [], blocked: [] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    setAlerts(await api.priceAlerts().catch(() => []));
    const [following, blocked] = await Promise.all([api.following().catch(() => []), api.blocked().catch(() => [])]);
    setRel({ following, blocked });
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const run = async (f: () => Promise<unknown>) => { setMsg(null); try { await f(); success(); setMsg({ ok: true, text: '✓' }); await refresh(); await load(); } catch (e) { setMsg({ ok: false, text: errText(t, e) }); } };
  const people = (list: any[]) => list.length === 0 ? <Text size="small" tone="sub">{t('ui.none')}</Text>
    : <Row style={{ flexWrap: 'wrap', gap: 8 }}>{list.map((u) => <Chip key={u.id} label={u.displayName ?? u.id.slice(0, 8)} onPress={() => router.push(`/profile/${u.id}`)} />)}</Row>;
  return (
    <Screen style={{ gap: space(3) }}>
      {msg && <Notice tone={msg.ok ? 'success' : 'error'} text={msg.text} />}
      <Card style={{ gap: 10 }}>
        <Text weight="700">{t('ui.nickname')}</Text>
        <Text size="small" tone="sub">{t('ui.nicknameDesc')}</Text>
        <Input value={nick} maxLength={20} onChangeText={setNick} testID="nickname" />
        <Button size="sm" title={t('common.save')} disabled={!nick.trim()} onPress={() => run(() => api.setNickname(nick.trim()))} testID="nickname-save" />
      </Card>
      <Card style={{ gap: 10 }}>
        <Text weight="700">{t('ui.antiPhishing')}</Text>
        <Text size="small" tone="sub">{me?.antiPhishingCode ? t('ui.antiPhishingSet', { code: me.antiPhishingCode }) : t('ui.antiPhishingDesc')}</Text>
        <Input value={apc} maxLength={20} placeholder={t('ui.antiPhishingPh')} onChangeText={setApc} testID="anti-phishing" />
        <Button size="sm" title={t('common.save')} disabled={apc.trim().length < 4} onPress={() => run(async () => { await api.setAntiPhishing(apc.trim()); setApc(''); })} />
      </Card>
      <Card style={{ gap: 0 }}>
        <Text weight="700">{t('ui.priceAlerts')}</Text>
        <Text size="small" tone="sub" style={{ marginBottom: 6 }}>{t('ui.priceAlertsDesc')}</Text>
        {alerts.length === 0 && <Text size="small" tone="sub">{t('ui.noAlerts')}</Text>}
        {alerts.map((a, i) => (
          <View key={a.id}>{i > 0 && <Divider />}
            <Row style={{ paddingVertical: 10, gap: 8 }}>
              <Text size="small" tone={a.side === 'buy' ? 'buy' : 'sell'} weight="700">{t(a.side === 'buy' ? 'market.buy' : 'market.sell')}</Text>
              <Text size="small" style={{ flex: 1 }}>{a.asset} {a.side === 'buy' ? '≤' : '≥'} {a.price} {a.fiat}</Text>
              <Text size="tiny" tone="sub">{a.active ? t('ui.alertActive') : t('ui.alertTriggered', { price: a.triggeredPrice ?? '' })}</Text>
              <Press onPress={() => run(() => api.deletePriceAlert(a.id))} accessibilityLabel={t('ui.remove')}><Ionicons name="trash-outline" size={16} color={c.sub} /></Press>
            </Row>
          </View>
        ))}
      </Card>
      <Card style={{ gap: 8 }}><Text weight="700">{t('ui.followedUsers')}</Text><Text size="small" tone="sub">{t('ui.followedDesc')}</Text>{people(rel.following)}</Card>
      <Card style={{ gap: 8 }}><Text weight="700">{t('ui.blockedUsers')}</Text><Text size="small" tone="sub">{t('ui.blockedDesc')}</Text>{people(rel.blocked)}</Card>
    </Screen>
  );
}
