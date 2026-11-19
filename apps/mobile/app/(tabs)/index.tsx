/** parley Trade: type what you pay, see what you get, best match first, every offer ranked by what you get. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/native';
import { rememberAd } from '../../src/cache';
import { useApp } from '../../src/app';
import { useI18n } from '../../src/i18n';
import { cleanDecimal, cryptoFor, fiatFor, inRange } from '../../src/decimal';
import { cdp, releaseLabel } from '../../src/format';
import { ASSETS, space } from '../../src/theme';
import { Badge, Button, Card, Chip, Divider, Hero, Input, Notice, PickerChip, Pill, Press, Row, Segmented, Skeleton, Text, errText } from '../../src/ui';

const POPULAR = ['USD', 'EUR', 'GBP', 'NGN', 'BRL', 'INR', 'TRY', 'ARS', 'VND', 'IDR', 'PHP', 'KES', 'UAH', 'PLN', 'MXN', 'ZAR'];

export default function Trade() {
  const params = useLocalSearchParams<{ fiat?: string; asset?: string; side?: string }>();
  const { colors: c, me } = useApp();
  const { t, num, money } = useI18n();
  const [side, setSide] = useState<'buy' | 'sell'>(params.side === 'sell' ? 'sell' : 'buy');
  const [asset, setAsset] = useState(params.asset ?? 'USDT');
  const [fiat, setFiat] = useState(params.fiat ?? 'USD');
  const [amount, setAmount] = useState('');
  const [pm, setPm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const h = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(h); }, [qInput]);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [merchantOnly, setMerchantOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [alert, setAlert] = useState<{ open: boolean; price: string; msg: string | null }>({ open: false, price: '', msg: null });
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0); // ignore out-of-order responses when filters change quickly
  const load = useCallback(async () => {
    const my = ++seq.current;
    const r = await api.book({ side, asset, fiat, ...(pm ? { paymentType: pm } : {}), ...(onlineOnly ? { onlineOnly: 'true' } : {}), ...(followingOnly ? { followingOnly: 'true' } : {}), ...(merchantOnly ? { merchantOnly: 'true' } : {}), ...(verifiedOnly ? { minTier: '1' } : {}), ...(q ? { q } : {}) }).catch(() => ({ items: [] }));
    if (my === seq.current) setItems(r.items);
  }, [side, asset, fiat, pm, onlineOnly, followingOnly, merchantOnly, verifiedOnly, q]);
  const activeFilters = [onlineOnly, followingOnly, merchantOnly, verifiedOnly, q].filter(Boolean).length;
  const saveAlert = async () => {
    try { await api.addPriceAlert({ side, asset, fiat, price: alert.price }); setAlert({ open: false, price: '', msg: t('ui.alertCreated') }); }
    catch (e) { setAlert({ ...alert, msg: errText(t, e) }); }
  };
  useEffect(() => { setItems(null); void load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  useEffect(() => { api.fiats().then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => null); }, []);
  useEffect(() => { api.paymentMethodTypes(fiat).then(setTypes).catch(() => setTypes([])); }, [fiat]);

  // Buy: pay fiat → get crypto. Sell: sell crypto → get fiat.
  const rows = useMemo(() => (items ?? []).map((ad) => {
    const fiatLeg = side === 'buy' ? amount : amount ? fiatFor(amount, ad.price) : '';
    const get = !amount ? '' : side === 'buy' ? cryptoFor(amount, ad.price) : fiatFor(amount, ad.price);
    return { ad, fiatLeg, get, fits: !fiatLeg || inRange(fiatLeg, ad.minAmount, ad.maxAmount) };
  }), [items, amount, side]);
  const usable = rows.filter((r) => r.fits);
  const best = usable[0] ?? rows[0];
  const offered = useMemo(() => { const s = new Set<string>(); for (const r of items ?? []) for (const p of r.paymentTypes ?? []) s.add(p); return types.filter((x) => s.has(x.code)).slice(0, 4); }, [items, types]);
  const getUnit = side === 'buy' ? asset : fiat;
  const fmtGet = (v: string) => (side === 'buy' ? num(v, cdp(asset), cdp(asset) === 2 ? 2 : 0) : num(v, 2));
  const open = (ad: any, fiatLeg: string) => { if (!me) return router.push('/login'); router.push({ pathname: '/trade', params: { adId: rememberAd(ad), side, amount: fiatLeg } }); };
  const fiatOptions = [...POPULAR.filter((f) => fiats.includes(f)), ...fiats.filter((f) => !POPULAR.includes(f))].map((f) => ({ value: f, label: f }));
  const cta = best?.get ? (side === 'buy' ? t('ui.buyAmount', { amount: fmtGet(best.get), asset }) : t('ui.sellFor', { amount: money(best.get, fiat) })) : t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), paddingTop: space(1), gap: space(3), paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between', gap: space(3) }}>
        <Text size="h1" style={{ flexShrink: 1 }} numberOfLines={1}>{t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset })}</Text>
        <View style={{ width: 170 }}><Segmented value={side} onChange={(v) => { setSide(v); setAmount(''); }} options={[{ value: 'buy', label: t('market.buy') }, { value: 'sell', label: t('market.sell') }]} /></View>
      </Row>

      <Hero>
        <Row style={{ gap: 6 }}>
          <Text weight="500">{side === 'buy' ? t('ui.youPayIn') : t('ui.youSellIn')}</Text>
          {side === 'buy'
            ? <PickerChip fixed label={fiat} value={fiat} options={fiatOptions} onChange={(v) => { setFiat(v); setPm(''); }} title={t('market.fiat')} />
            : <PickerChip fixed label={asset} value={asset} options={ASSETS.map((a) => ({ value: a, label: a }))} onChange={setAsset} title={t('market.asset')} />}
        </Row>
        <TextInput testID="pay-amount" accessibilityLabel={t('market.amount')} value={amount} onChangeText={(v) => setAmount(cleanDecimal(v))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={`${c.sub}66`}
          style={{ ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}), color: c.text, fontSize: 84, fontWeight: '800', letterSpacing: -3.5, textAlign: 'center', minWidth: 120, alignSelf: 'stretch', fontVariant: ['tabular-nums'], paddingVertical: 0 }} />
        <Row style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill label={`${t('ui.youGet')} ${best?.get ? `${fmtGet(best.get)} ${getUnit}` : '—'}`} />
          {side === 'buy'
            ? <PickerChip fixed label={asset} value={asset} options={ASSETS.map((a) => ({ value: a, label: a }))} onChange={setAsset} title={t('market.asset')} />
            : <PickerChip fixed label={fiat} value={fiat} options={fiatOptions} onChange={(v) => { setFiat(v); setPm(''); }} title={t('market.fiat')} />}
        </Row>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: space(1) }}>
          <Chip label={t('ui.anyMethod')} active={!pm} onPress={() => setPm('')} />
          {offered.map((x) => <Chip key={x.code} label={x.name} active={pm === x.code} onPress={() => setPm(x.code)} />)}
        </Row>
        <Button size="lg" variant={side === 'buy' ? 'primary' : 'sell'} title={cta} disabled={!best} onPress={() => best && open(best.ad, best.fiatLeg)} style={{ alignSelf: 'stretch', marginTop: space(2) }} testID="best-cta" />
      </Hero>

      {best ? <>
        <Press onPress={() => router.push(`/profile/${best.ad.advertiser.id}`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size="small" tone="sub">{t('ui.bestMatchOf', { n: usable.length || rows.length })} · {t('ui.viewPassport')}</Text>
              <Row style={{ gap: 8 }}><Text size="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{best.ad.advertiser.displayName}</Text>{best.ad.advertiser.online && <Dot />}</Row>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-up-outline" size={18} color={c.text} style={{ transform: [{ rotate: '45deg' }] }} /></View>
          </Card>
        </Press>
        <Row style={{ gap: space(2), alignItems: 'stretch' }}>
          <Stat label={t('market.price')} value={`${num(best.ad.price, 8)} ${fiat}`} pill={<Badge label={t('ui.bestOfN', { n: rows.length })} tone="warning" />} />
          <Stat label={t('ui.usualRelease')} value={releaseLabel(best.ad.advertiser.avgReleaseSec, t)} pill={best.ad.advertiser.avgReleaseSec && best.ad.advertiser.avgReleaseSec < 300 ? <Badge label={t('ui.fast')} tone="success" /> : null} />
          <Stat label={t('ui.protection')} value={best.ad.advertiser.verifiedBadge ? t('ui.merchantBond') : t('ui.escrow')} pill={<Badge label={t('ui.escrowLocked')} tone="success" />} />
        </Row>
      </> : items === null ? <Skeleton height={160} /> : <Card><Text tone="sub" style={{ textAlign: 'center', paddingVertical: space(6) }}>{t('market.empty')}</Text></Card>}

      <Card style={{ gap: 0 }} testID="book">
        <Row style={{ justifyContent: 'space-between', marginBottom: space(1) }}>
          <Text size="h3">{t('ui.allOffers')}</Text>
          <Row style={{ gap: 6 }}>
            {me && <Button size="sm" variant="soft" icon="notifications-outline" title={t('ui.priceAlert')} onPress={() => setAlert({ open: !alert.open, price: best?.ad.price ?? '', msg: null })} testID="alert-open" />}
            <Button size="sm" variant={showFilters ? 'primary' : 'soft'} icon="options-outline" title={activeFilters ? `${t('ui.filters')} · ${activeFilters}` : t('ui.filters')} onPress={() => setShowFilters((v) => !v)} testID="filter-toggle" />
          </Row>
        </Row>
        {alert.msg && <Notice tone="success" text={alert.msg} />}
        {alert.open && (
          <View style={{ gap: 8, paddingVertical: space(2) }} testID="price-alert">
            <Text size="small" tone="sub">{t(side === 'buy' ? 'ui.alertBuyHint' : 'ui.alertSellHint', { asset })}</Text>
            <Input label={t('ui.targetPrice')} unit={fiat} keyboardType="decimal-pad" value={alert.price} onChangeText={(v) => setAlert({ ...alert, price: cleanDecimal(v) })} testID="alert-price" />
            <Button title={t('ui.createAlert')} disabled={!alert.price} onPress={saveAlert} testID="alert-save" />
          </View>
        )}
        {showFilters && (
          <View style={{ gap: 10, paddingVertical: space(2) }} testID="filters">
            <Input placeholder={t('ui.searchTraderPh')} value={qInput} onChangeText={(v) => setQInput(v.slice(0, 40))} autoCapitalize="none" testID="filter-q" />
            <Row style={{ flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t('ui.onlineOnly')} active={onlineOnly} onPress={() => setOnlineOnly(!onlineOnly)} />
              {me && <Chip label={t('ui.followingOnly')} active={followingOnly} onPress={() => setFollowingOnly(!followingOnly)} />}
              <Chip label={t('ui.merchantsOnly')} active={merchantOnly} onPress={() => setMerchantOnly(!merchantOnly)} />
              <Chip label={t('ui.verifiedOnly')} active={verifiedOnly} onPress={() => setVerifiedOnly(!verifiedOnly)} />
            </Row>
            {activeFilters > 0 && <Press onPress={() => { setQInput(''); setOnlineOnly(false); setFollowingOnly(false); setMerchantOnly(false); setVerifiedOnly(false); }}><Text size="small" tone="sub" style={{ textDecorationLine: 'underline' }}>{t('ui.clearFilters')}</Text></Press>}
          </View>
        )}
        {items === null && <Skeleton height={60} />}
        {rows.map(({ ad, get, fits, fiatLeg }, i) => (
          <View key={ad.id} style={{ opacity: fits ? 1 : 0.5 }} testID="ad-row">
            {i > 0 && <Divider />}
            <Row style={{ paddingVertical: space(3), gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Row style={{ gap: 6 }}><Text weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{ad.advertiser.displayName}</Text>{ad.advertiser.online && <Dot />}{i === 0 && fits && <Badge label={t('ui.best')} tone="success" />}</Row>
                <Text size="tiny" tone="sub" numberOfLines={1}>{num(ad.price, 8)} · {releaseLabel(ad.advertiser.avgReleaseSec, t)} · {ad.advertiser.verifiedBadge ? t('ui.merchantBond') : t('ui.escrow')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text weight="700">{get ? `${fmtGet(get)} ${getUnit}` : `${num(ad.minAmount, 2)}–${num(ad.maxAmount, 2)}`}</Text>
                {!get && <Text size="tiny" tone="sub">{ad.fiat}</Text>}
              </View>
              <Button size="sm" variant="soft" title={t(side === 'buy' ? 'market.buy' : 'market.sell')} onPress={() => open(ad, fiatLeg)} testID="trade" />
            </Row>
          </View>
        ))}
      </Card>
      <Press onPress={() => router.push(me ? '/otc' : '/login')} testID="otc-link">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="briefcase-outline" size={20} color={c.primary} />
          <View style={{ flex: 1 }}><Text weight="700">{t('ui.otcTitle')}</Text><Text size="small" tone="sub">{t('ui.otcTeaser')}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={c.sub} />
        </Card>
      </Press>
      {!me && <Text size="tiny" tone="sub" style={{ textAlign: 'center' }}>{t('ui.escrowNote')}</Text>}
    </ScrollView>
  );
}

function Dot() {
  const { colors: c } = useApp();
  return <View accessibilityLabel="online" testID="online-dot" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.buy }} />;
}

function Stat({ label, value, pill }: { label: string; value: string; pill: React.ReactNode }) {
  return (
    <Card style={{ flex: 1, padding: space(3.5), gap: space(2), justifyContent: 'space-between', minHeight: 112 }}>
      <View style={{ gap: 6 }}><Text size="tiny" weight="600" numberOfLines={2}>{label}</Text>{pill}</View>
      <Text weight="700" numberOfLines={2}>{value}</Text>
    </Card>
  );
}
