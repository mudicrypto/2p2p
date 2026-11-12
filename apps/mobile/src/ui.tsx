/** Mobile UI kit: parley design language, same tokens as the web design system (packages/ui). */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView, Text as RNText, TextInput, View,
  type PressableProps, type ScrollViewProps, type TextInputProps, type TextProps, type ViewProps, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from './app';
import { ASSET_COLORS, BRAND, font, radius, space } from './theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
export type IconName = keyof typeof Ionicons.glyphMap;
export const tap = () => { void Haptics.selectionAsync().catch(() => null); };
export const success = () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null); };

export function Screen({ children, scroll = true, padded = true, style, ...p }: ScrollViewProps & { scroll?: boolean; padded?: boolean }) {
  const c = useColors();
  const pad: ViewStyle = padded ? { padding: space(4), gap: space(4), paddingBottom: space(10) } : {};
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, pad, style as ViewStyle]}>{children}</View>;
  return <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[pad, style as ViewStyle]} keyboardShouldPersistTaps="handled" {...p}>{children}</ScrollView>;
}

type Tone = 'default' | 'sub' | 'primary' | 'buy' | 'sell' | 'warn' | 'white' | 'onPrimary';
export function Text({ size = 'body', weight, tone = 'default', mono, style, ...p }: TextProps & { size?: keyof typeof font; weight?: '400' | '500' | '600' | '700' | '800'; tone?: Tone; mono?: boolean }) {
  const c = useColors();
  const color = { default: c.text, sub: c.sub, primary: c.warn, buy: c.buy, sell: c.sell, warn: c.warn, white: '#fff', onPrimary: c.onPrimary }[tone];
  const w = weight ?? (size === 'h1' || size === 'h2' ? '700' : size === 'h3' ? '600' : '400');
  return <RNText style={[{ color, fontSize: font[size], fontWeight: w, letterSpacing: size === 'h1' ? -1.1 : size === 'h2' ? -0.6 : size === 'h3' ? -0.3 : 0, fontVariant: ['tabular-nums'], fontFamily: mono ? MONO : undefined }, style]} {...p} />;
}

export function Card({ style, children, ...p }: ViewProps) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.xl, padding: space(5) }, style]} {...p}>{children}</View>;
}
export function Row({ style, ...p }: ViewProps) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(2) }, style]} {...p} />; }
export function Divider() { const c = useColors(); return <View style={{ height: 1, backgroundColor: c.border }} />; }

type BtnVariant = 'primary' | 'ink' | 'buy' | 'sell' | 'outline' | 'soft' | 'ghost';
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style, testID }: { title: string; onPress?: () => void; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; style?: ViewStyle; testID?: string }) {
  const c = useColors();
  const h = { sm: 38, md: 50, lg: 58 }[size];
  const fg = { primary: c.onPrimary, ink: c.onInk, buy: c.onPrimary, sell: '#1a1714', outline: c.text, soft: c.text, ghost: c.text }[variant];
  const bg = { primary: c.primary, ink: c.ink, buy: c.primary, sell: c.sell, outline: 'transparent', soft: c.muted, ghost: 'transparent' }[variant];
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled || loading} onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [{ borderRadius: radius.pill, backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], borderWidth: variant === 'outline' ? 1 : 0, borderColor: c.border }, style]}>
      <Row style={{ height: h, paddingHorizontal: space(size === 'sm' ? 4 : 4), justifyContent: 'center', gap: space(2) }}>
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={fg} /> : null}
        <RNText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flexShrink: 1, color: fg, fontWeight: '600', fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 16 }}>{title}</RNText>
      </Row>
    </Pressable>
  );
}
export function IconButton({ icon, onPress, label, badge }: { icon: IconName; onPress?: () => void; label: string; badge?: number }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={label} onPress={() => { tap(); onPress?.(); }} hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.muted : c.card })}>
      <Ionicons name={icon} size={20} color={c.text} />
      {!!badge && <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.sell, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}><RNText style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge > 9 ? '9+' : badge}</RNText></View>}
    </Pressable>
  );
}

export function Input({ label, unit, hint, big, style, ...p }: TextInputProps & { label?: string; unit?: React.ReactNode; hint?: React.ReactNode; big?: boolean }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && <Text size="small" tone="sub" weight="500">{label}</Text>}
      <Row style={{ backgroundColor: c.muted, borderRadius: radius.md, borderWidth: 1.5, borderColor: focus ? c.primary : 'transparent', paddingHorizontal: space(4), height: big ? 64 : 52 }}>
        <TextInput placeholderTextColor={c.sub} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[{ flex: 1, color: c.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}), fontSize: big ? 26 : 16, fontWeight: big ? '700' : '400', fontVariant: ['tabular-nums'] }, style]} {...p} />
        {typeof unit === 'string' ? <Text weight="700" tone="sub">{unit}</Text> : unit}
      </Row>
      {hint && (typeof hint === 'string' ? <Text size="tiny" tone="sub">{hint}</Text> : hint)}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; colors?: Partial<Record<T, string>> }) {
  const c = useColors();
  return (
    <Row style={{ backgroundColor: c.muted, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { tap(); onChange(o.value); }} style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent' }}>
            <RNText numberOfLines={1} style={{ fontWeight: '600', fontSize: 15, color: on ? c.onInk : c.text }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </Row>
  );
}
export function Chip({ label, active, onPress, left }: { label: string; active?: boolean; onPress?: () => void; left?: React.ReactNode }) {
  const c = useColors();
  return (
    <Pressable onPress={() => { tap(); onPress?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 38, borderRadius: radius.pill, backgroundColor: active ? c.ink : c.muted }}>
      {left}<RNText style={{ color: active ? c.onInk : c.text, fontWeight: '600', fontSize: 15 }}>{label}</RNText>
    </Pressable>
  );
}
export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const c = useColors();
  const [bg, fg] = { default: [c.muted, c.text], success: ['#a6d9a0', '#16301a'], warning: [c.primary, c.onPrimary], danger: [c.sell, '#2a110b'], info: ['#a9bdf5', '#121a33'] }[tone];
  return <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><RNText style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</RNText></View>;
}
/** Huge display numeral (parley's signature). */
export function Big({ children, size = 76, tone, style, testID }: { children: React.ReactNode; size?: number; tone?: 'sell' | 'sub'; style?: object; testID?: string }) {
  const c = useColors();
  return <RNText testID={testID} adjustsFontSizeToFit numberOfLines={1} style={[{ color: tone === 'sell' ? c.sell : tone === 'sub' ? c.sub : c.text, fontSize: size, fontWeight: '800', letterSpacing: -size * 0.045, lineHeight: size * 1.05, fontVariant: ['tabular-nums'], textAlign: 'center' }, style]}>{children}</RNText>;
}
/** Outlined pill used under big numerals ("You get 498.60 USDT", "X USDT in escrow"). */
export function Pill({ label, icon, tone }: { label: string; icon?: IconName; tone?: 'sell' | 'info' }) {
  const c = useColors();
  const col = tone === 'sell' ? c.sell : tone === 'info' ? c.info : c.primary;
  return <Row style={{ alignSelf: 'center', borderWidth: 1, borderColor: col, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, gap: 6 }}>{icon && <Ionicons name={icon} size={14} color={c.text} />}<RNText style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{label}</RNText></Row>;
}
/** Hero card with the warm radial glow behind its content. */
export function Hero({ children, tone, style }: { children: React.ReactNode; tone?: 'sell' | 'info'; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[{ zIndex: 0, backgroundColor: c.card, borderRadius: radius.xl, overflow: 'hidden', paddingVertical: space(8), paddingHorizontal: space(5), alignItems: 'center', gap: space(3) }, style]}>
      <Glow color={tone === 'sell' ? 'rgba(236,134,112,0.35)' : tone === 'info' ? 'rgba(169,189,245,0.35)' : c.glow} />
      {children}
    </View>
  );
}
export function Glow({ color }: { color: string }) {
  const id = useSvgId('glow');
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs><RadialGradient id={id} cx="50%" cy="38%" rx="50%" ry="55%"><Stop offset="0" stopColor={color} /><Stop offset="1" stopColor={color} stopOpacity={0} /></RadialGradient></Defs>
        <Path d="M0 0H100V100H0Z" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
export function AssetIcon({ asset, size = 32 }: { asset: string; size?: number }) {
  const sym = { USDT: '₮', BTC: '₿', ETH: 'Ξ' }[asset] ?? asset[0];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: ASSET_COLORS[asset] ?? '#888', alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.5 }}>{sym}</RNText></View>;
}
const AV = [['#7b61ff', '#37c8ff'], ['#ff6a88', '#ff99ac'], ['#1fcb8b', '#7ee8c0'], ['#ffb020', '#ffd86b'], ['#5b8cff', '#a0c4ff']] as const;
export function Avatar({ name, seed, size = 40, online }: { name: string; seed?: string; size?: number; online?: boolean }) {
  const c = useColors();
  const k = [...(seed ?? name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length;
  return (
    <View>
      <LinearGradient colors={AV[k] as unknown as [string, string]} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{(name || '?').slice(0, 1).toUpperCase()}</RNText>
      </LinearGradient>
      {online && <View style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: c.buy, borderWidth: 2, borderColor: c.card }} />}
    </View>
  );
}
export function PayChip({ code }: { code: string }) {
  const c = useColors();
  const hue = [...code].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  return <Row style={{ gap: 6, backgroundColor: c.muted, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: `hsl(${hue}, 85%, 60%)` }} /><RNText style={{ color: c.text, fontSize: 11, fontWeight: '600' }}>{code}</RNText></Row>;
}
export function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const c = useColors();
  const [done, setDone] = useState(false);
  return (
    <Pressable onPress={async () => { await Clipboard.setStringAsync(value); success(); setDone(true); setTimeout(() => setDone(false), 1400); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
      <View style={{ flex: 1, gap: 2 }}><Text size="tiny" tone="sub">{label}</Text><Text weight="600" mono={mono} selectable>{value}</Text></View>
      <Ionicons name={done ? 'checkmark-circle' : 'copy-outline'} size={18} color={done ? c.buy : c.sub} />
    </Pressable>
  );
}
export function Steps({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  const c = useColors();
  return (
    <Row style={{ alignItems: 'flex-start', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < current; const active = i === current;
        const col = done || active ? (failed && active ? c.sell : c.primary) : c.border;
        return (
          <View key={s} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Row style={{ width: '100%', gap: 0 }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : done || active ? c.primary : c.border }} />
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: col, backgroundColor: done ? c.primary : c.card, alignItems: 'center', justifyContent: 'center' }}>
                {done ? <Ionicons name="checkmark" size={14} color={c.onPrimary} /> : <RNText style={{ color: col, fontWeight: '800', fontSize: 12 }}>{i + 1}</RNText>}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : done ? c.primary : c.border }} />
            </Row>
            <Text size="tiny" tone={done || active ? 'default' : 'sub'} weight="600" style={{ textAlign: 'center' }}>{s}</Text>
          </View>
        );
      })}
    </Row>
  );
}
export function Skeleton({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  const c = useColors();
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => { const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true })])); a.start(); return () => a.stop(); }, [o]);
  return <Animated.View style={[{ height, borderRadius: radius.lg, backgroundColor: c.muted, opacity: o }, style]} />;
}
export function Empty({ icon, text, action }: { icon: IconName; text: string; action?: React.ReactNode }) {
  const c = useColors();
  return <View style={{ alignItems: 'center', gap: 12, paddingVertical: 48 }}><View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={30} color={c.sub} /></View><Text tone="sub" style={{ textAlign: 'center' }}>{text}</Text>{action}</View>;
}
export function Notice({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warn' | 'error' | 'success'; icon?: IconName }) {
  const c = useColors();
  const col = { info: c.sub, warn: c.warn, error: c.sell, success: c.buy }[tone];
  return <Row style={{ alignItems: 'flex-start', backgroundColor: tone === 'info' ? c.muted : `${col}22`, borderRadius: radius.md, padding: space(3) }}><Ionicons name={icon ?? (tone === 'error' ? 'alert-circle' : tone === 'success' ? 'checkmark-circle' : tone === 'warn' ? 'warning' : 'shield-checkmark')} size={16} color={col} /><Text size="small" style={{ flex: 1, color: tone === 'info' ? c.text : col }}>{text}</Text></Row>;
}
export function Gradient({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <LinearGradient colors={[c.primary2, c.primary, c.primary3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>{children}</LinearGradient>;
}
export function Header({ title, right, sub }: { title: string; right?: React.ReactNode; sub?: string }) {
  const c = useColors();
  const ins = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: ins.top + 8, paddingHorizontal: space(4), paddingBottom: 8, backgroundColor: c.bg }}>
      <Row style={{ justifyContent: 'space-between' }}><Text size="h2">{title}</Text><Row style={{ gap: 0 }}>{right}</Row></Row>
      {sub && <Text size="small" tone="sub">{sub}</Text>}
    </View>
  );
}
export function Press({ children, style, ...p }: PressableProps & { style?: ViewStyle }) {
  return <Pressable {...p} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>{children}</Pressable>;
}
export function useErr() {
  const [err, setErr] = useState<string | null>(null);
  return { err, setErr, show: err ? <Notice tone="error" text={err} /> : null };
}
/** Human message for an API error: localized by error code, falling back to the server message. */
export function errText(t: (k: string) => string, e: unknown) {
  const code = (e as { code?: string })?.code;
  if (code && t(`errors.${code}`) !== `errors.${code}`) return t(`errors.${code}`);
  return (e as Error)?.message || t('common.error');
}

let svgSeq = 0;
const useSvgId = (p: string) => useRef(`${p}${++svgSeq}`).current;
/** parley mark: lowercase "p" in a sand circle (same as the web Logo). */
export function Logo({ size = 32 }: { size?: number }) {
  const c = useColors();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: c.onPrimary, fontWeight: '800', fontSize: size * 0.6, marginTop: -size * 0.08, letterSpacing: -1 }}>p</RNText></View>;
}
export function Wordmark({ size = 28 }: { size?: number }) {
  const c = useColors();
  return <RNText style={{ color: c.text, fontWeight: '700', letterSpacing: -size * 0.04, fontSize: size * 0.8 }}>{BRAND.name}</RNText>;
}
/** Dropdown-style chip that opens a bottom-sheet list. */
export function PickerChip<T extends string>({ label, value, options, onChange, title, fixed }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; title?: string; fixed?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const ins = useSafeAreaInsets();
  return (
    <>
      <Pressable onPress={() => { tap(); setOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.muted, flexShrink: fixed ? 0 : 1 }}>
        <RNText numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 13, flexShrink: 1 }}>{label}</RNText>
        <Ionicons name="chevron-down" size={14} color={c.sub} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setOpen(false)} />
        <View style={{ maxHeight: '70%', backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: ins.bottom + 12, borderTopWidth: 1, borderColor: c.border }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginVertical: 10 }} />
          {title && <Text weight="700" style={{ paddingHorizontal: 20, paddingBottom: 8 }}>{title}</Text>}
          <ScrollView>
            {options.map((o) => (
              <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
                <Text weight={o.value === value ? '700' : '400'} style={{ flex: 1 }}>{o.label}</Text>
                {o.value === value && <Ionicons name="checkmark-circle" size={20} color={c.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
