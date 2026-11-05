import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, FlatList, Text, TextInput, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { api, tokenStore } from '../src/native';

export default function Market() {
  const params = useLocalSearchParams<{ fiat?: string; asset?: string }>();
  const [fiat, setFiat] = useState(params.fiat ?? 'EUR');
  const [items, setItems] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const load = useCallback(() => api.book({ side: 'buy', asset: params.asset ?? 'USDT', fiat }).then((r) => setItems(r.items)).catch(() => setItems([])), [fiat, params.asset]);
  useEffect(() => { void load(); }, [load]);
  const buy = async (adId: string) => {
    if (!(await tokenStore.get())) return router.push('/login');
    try { const o = await api.createOrder(adId, amount); router.push(`/orders/${o.id}`); } catch (e) { Alert.alert('Order failed', (e as Error).message); }
  };
  return (
    <View style={{ flex: 1, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput accessibilityLabel="Currency" value={fiat} onChangeText={(t) => setFiat(t.toUpperCase().slice(0, 3))} style={{ borderWidth: 1, padding: 8, width: 80 }} />
        <TextInput accessibilityLabel="Amount" placeholder="Amount" keyboardType="decimal-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))} style={{ borderWidth: 1, padding: 8, flex: 1 }} />
        <Button title="Refresh" onPress={load} />
      </View>
      <FlatList data={items} keyExtractor={(a) => a.id} renderItem={({ item }) => (
        <View style={{ borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontWeight: '600' }}>{item.advertiser.displayName} · {item.price} {item.fiat}</Text>
          <Text>{item.minAmount}–{item.maxAmount} {item.fiat} · {item.paymentTypes.join(', ')}</Text>
          <Button title={`Buy ${item.asset}`} disabled={!amount} onPress={() => buy(item.id)} />
        </View>
      )} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}><Link href="/wallet">Wallet</Link><Link href="/login">Account</Link></View>
    </View>
  );
}
