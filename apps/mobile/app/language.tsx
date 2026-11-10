import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/app';
import { LOCALES, NATIVE_NAMES } from '../src/locales';
import { space } from '../src/theme';
import { Card, Divider, Press, Text } from '../src/ui';

export default function Language() {
  const { colors: c, locale, setLocale } = useApp();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4) }}>
      <Card style={{ paddingVertical: 4 }}>
        {LOCALES.map((l, i) => (
          <Press key={l} onPress={() => { setLocale(l); router.back(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
            <Text weight={l === locale ? '700' : '400'} style={{ flex: 1 }}>{NATIVE_NAMES[l]}</Text>
            {l === locale && <Ionicons name="checkmark-circle" size={20} color={c.primary} />}
            {i < LOCALES.length - 1 && <Divider />}
          </Press>
        ))}
      </Card>
    </ScrollView>
  );
}
