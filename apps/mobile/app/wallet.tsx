import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../src/native';
export default function Wallet() {
  const [b, setB] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => { api.balances().then(setB).catch(() => null); }, []);
  return <View style={{ padding: 16, gap: 6 }}>{Object.entries(b).map(([a, k]) => <Text key={a}>{a}: {k.available ?? '0'} (escrow {k.escrow ?? '0'})</Text>)}</View>;
}
