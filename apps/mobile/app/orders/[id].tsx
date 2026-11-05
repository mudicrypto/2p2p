import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, biometricUnlock } from '../../src/native';

export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [o, setO] = useState<any>(null);
  const [totp, setTotp] = useState('');
  const load = useCallback(() => api.order(id).then(setO).catch(() => null), [id]);
  useEffect(() => { void load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);
  const act = async (f: () => Promise<unknown>) => { try { setO(await f()); } catch (e) { Alert.alert('Action failed', (e as Error).message); } };
  if (!o) return <Text style={{ padding: 16 }}>Loading…</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>{o.role === 'buyer' ? 'Buying' : 'Selling'} {o.cryptoAmount} {o.asset}</Text>
      <Text testID="status">Status: {o.status}</Text>
      <Text>Amount: {o.fiatAmount} {o.fiat} @ {o.price}</Text>
      <Text selectable>Reference: {o.referenceCode}</Text>
      {o.payee && <Text selectable>Pay to: {o.payee.holderName} · {Object.values(o.payee.details ?? {}).join(' ')}</Text>}
      {o.role === 'buyer' && o.status === 'AWAITING_PAYMENT' && <>
        <Button title="I have paid" onPress={() => act(() => api.markPaid(id))} />
        <Button title="Cancel order" color="#999" onPress={() => act(() => api.cancel(id))} />
      </>}
      {o.role === 'seller' && o.status === 'PAID' && <>
        <TextInput placeholder="2FA code" keyboardType="number-pad" value={totp} onChangeText={setTotp} style={{ borderWidth: 1, padding: 10 }} />
        <Button title="Release crypto" onPress={async () => { if (await biometricUnlock('Confirm release')) await act(() => api.release(id, totp)); }} />
      </>}
    </ScrollView>
  );
}
