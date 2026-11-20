import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, WEB_URL } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Button, Card, CopyRow, Row, Screen, Skeleton, Text } from '../src/ui';

/** Invite friends: the user's real invite code and counts. Rewards are not live yet, and the screen says so. */
export default function Rewards() {
  const { colors: c, me, locale } = useApp();
  const { t, num } = useI18n();
  const [info, setInfo] = useState<{ code: string; invited: number; traded: number } | null>(null);
  const [rw, setRw] = useState<Awaited<ReturnType<typeof api.referralRewards>> | null>(null);
  useEffect(() => { if (me) { api.referral().then(setInfo).catch(() => null); api.referralRewards().then(setRw).catch(() => null); } }, [me]);
  const link = info ? `${WEB_URL}/${locale}/signup?ref=${info.code}` : '';
  return (
    <Screen style={{ gap: space(3) }}>
      <Card style={{ alignItems: 'center', gap: space(3), paddingVertical: space(6), borderColor: `${c.primary}55` }}>
        <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="gift" size={36} color={c.onPrimary} /></View>
        <Text size="h2" style={{ textAlign: 'center' }}>{t('ui.inviteTitle')}</Text>
        <Text tone="sub" style={{ textAlign: 'center' }}>{t('ui.referralHow')}</Text>
      </Card>
      {!me ? <Button title={t('nav.signup')} onPress={() => router.push('/signup')} /> : !info ? <Skeleton height={160} /> : <>
        <Card style={{ gap: 10 }}>
          <CopyRow label={t('ui.referralCode')} value={info.code} mono />
          <CopyRow label={t('ui.inviteLink')} value={link} />
          <Button icon="share-outline" title={t('ui.inviteLink')} onPress={() => void Share.share({ message: link }).catch(() => null)} />
        </Card>
        <Row style={{ gap: space(3) }}>
          <Card style={{ flex: 1, gap: 4 }}><Ionicons name="person-add-outline" size={20} color={c.primary} /><Text size="h2" testID="ref-invited">{num(String(info.invited))}</Text><Text size="small" tone="sub">{t('ui.refInvited')}</Text></Card>
          <Card style={{ flex: 1, gap: 4 }}><Ionicons name="people-outline" size={20} color={c.primary} /><Text size="h2">{num(String(info.traded))}</Text><Text size="small" tone="sub">{t('ui.refTraded')}</Text></Card>
        </Row>
        {rw?.enabled ? <Card style={{ gap: 10 }} testID="ref-rewards">
          <Text size="small" tone="sub">{t('ui.rewardRule', { amount: rw.rewardAmount, asset: rw.rewardAsset, min: rw.minTradeUsd })}</Text>
          <Row style={{ gap: space(3) }}>
            <View style={{ flex: 1 }}><Text size="tiny" tone="sub">{t('ui.rewardEarned')}</Text><Text size="h3">{rw.earned} {rw.rewardAsset}</Text></View>
            <View style={{ flex: 1 }}><Text size="tiny" tone="sub">{t('ui.rewardPending')}</Text><Text size="h3">{rw.pending} {rw.rewardAsset}</Text></View>
          </Row>
        </Card> : <Text size="small" tone="sub" style={{ textAlign: 'center' }}>{t('ui.referralRewardsSoon')}</Text>}
      </>}
    </Screen>
  );
}
