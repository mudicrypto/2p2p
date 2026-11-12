import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/native';
import { useApp } from '../src/app';
import { useI18n } from '../src/i18n';
import { space } from '../src/theme';
import { Button, Card, Empty, Press, Text } from '../src/ui';

export default function Notifications() {
  const { colors: c } = useApp();
  const { t, date } = useI18n();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api.notifications().then(setRows).catch(() => null); }, []);
  return (
    <FlatList style={{ backgroundColor: c.bg }} data={rows} keyExtractor={(n) => String(n.id)} contentContainerStyle={{ padding: space(4), gap: space(2) }}
      ListHeaderComponent={rows.length ? <Button variant="ghost" size="sm" icon="checkmark-done" title={t('notifications.markRead')} onPress={() => api.call('/notifications/read', { body: {} }).then(() => setRows(rows.map((r) => ({ ...r, read: true }))))} style={{ alignSelf: 'flex-end' }} /> : undefined}
      ListEmptyComponent={<Empty icon="notifications-off-outline" text={t('notifications.empty')} />}
      renderItem={({ item: n }) => (
        <Press onPress={() => n.payload?.orderId && router.push(`/orders/${n.payload.orderId}`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: n.read ? c.card : `${c.primary}14` }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: n.type === 'security_alert' ? `${c.sell}22` : `${c.primary}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={n.type === 'chat_message' ? 'chatbubble' : n.type === 'security_alert' ? 'shield' : n.type.startsWith('order') ? 'receipt' : 'notifications'} size={18} color={n.type === 'security_alert' ? c.sell : c.primary} />
            </View>
            <View style={{ flex: 1 }}><Text weight="600">{t(`notifications.types.${n.type}`)}</Text><Text size="tiny" tone="sub">{date(n.createdAt)}</Text></View>
            {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />}
          </Card>
        </Press>
      )} />
  );
}
