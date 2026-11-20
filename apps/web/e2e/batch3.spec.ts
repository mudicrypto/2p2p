import { test, expect } from '@playwright/test';
import { signupAndLogin, dev, uniq } from './util';

/** Promoted ads, bulk ad tools, analytics, shop link page, price chart and first-trade guide. */
test('merchant tools and shop page', async ({ browser }) => {
  const sctx = await browser.newContext(); const s = await sctx.newPage();
  await signupAndLogin(s);
  await dev(sctx, '/dev/tier', { tier: 1 });
  await dev(sctx, '/dev/faucet', { asset: 'USDT', amount: '500' });
  const m = await dev(sctx, '/payment-methods', { type: 'SEPA', holderName: 'Shop Seller', details: { iban: 'DE89370400440532013000' } });
  await dev(sctx, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.991', minAmount: '10', maxAmount: '100', totalAmount: '50', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
  await dev(sctx, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.992', minAmount: '10', maxAmount: '100', totalAmount: '50', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
  const nick = `Shop ${uniq().slice(-6)}`;
  await s.goto('/en/account');
  await s.getByTestId('nickname').fill(nick);
  await s.getByTestId('nickname-save').click();
  await expect(s.getByRole('heading', { name: nick })).toBeVisible();

  // Analytics card, shop link and promotion.
  await s.goto('/en/ads');
  await expect(s.getByTestId('merchant-stats')).toBeVisible();
  await expect(s.getByTestId('shop-link')).toContainText(`/en/m/${encodeURIComponent(nick)}`);
  await s.getByTestId('promote-open').first().click();
  await s.getByTestId('promote-days').selectOption('3');
  await expect(s.getByTestId('promote-cost')).toHaveText('6 USDT');
  await s.getByTestId('promote-pay').click();
  await expect(s.getByTestId('promote')).toHaveCount(0);
  await expect(s.getByTestId('promoted-badge')).toHaveCount(1);

  // Bulk pause then resume both ads.
  for (const c of await s.getByTestId('ad-select').all()) await c.check();
  await s.getByTestId('bulk-pause').click();
  await expect(s.getByTestId('bulk-msg')).toContainText('2 of 2');
  await s.getByTestId('bulk-resume').click();
  await expect(s.getByTestId('bulk-msg')).toContainText('2 of 2');

  // A buyer sees the promoted slot, the price chart, the guide, and the shop page.
  const bctx = await browser.newContext(); const b = await bctx.newPage();
  await signupAndLogin(b);
  await b.goto('/en/p2p?fiat=EUR');
  await expect(b.getByTestId('promoted')).toContainText(nick);
  await expect(b.getByTestId('price-chart')).toBeVisible();
  await expect(b.getByTestId('first-trade-guide')).toBeVisible();
  await b.getByTestId('guide-close').click();
  await expect(b.getByTestId('first-trade-guide')).toHaveCount(0);
  await b.goto(`/en/m/${encodeURIComponent(nick)}`);
  await expect(b.getByTestId('shop')).toContainText(nick);
  await expect(b.getByTestId('shop-ad')).toHaveCount(2);
  await b.getByTestId('shop-trade').first().click();
  await expect(b.getByRole('dialog')).toBeVisible();
  await b.goto('/en/m/nobody-here-zzz');
  await expect(b.getByTestId('shop-missing')).toBeVisible();
  await sctx.close(); await bctx.close();
});

test('seller sees receipt checks', async ({ browser }) => {
  const sctx = await browser.newContext(); const s = await sctx.newPage();
  await signupAndLogin(s);
  await dev(sctx, '/dev/tier', { tier: 1 });
  await dev(sctx, '/dev/faucet', { asset: 'USDT', amount: '200' });
  const m = await dev(sctx, '/payment-methods', { type: 'SEPA', holderName: 'Receipt Seller', details: { iban: 'DE89370400440532013000' } });
  const ad = await dev(sctx, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.995', minAmount: '10', maxAmount: '100', totalAmount: '50', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
  const bctx = await browser.newContext(); const b = await bctx.newPage();
  await signupAndLogin(b);
  const o = await dev(bctx, '/orders', { adId: ad.id, fiatAmount: '20' });
  // Upload an "edited" receipt as the buyer.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from(`Exif Adobe Photoshop ${uniq()}`, 'latin1'), Buffer.from([0xff, 0xd9])]);
  await dev(bctx, `/orders/${o.id}/attachments`, { contentType: 'image/jpeg', dataBase64: jpeg.toString('base64') });
  await s.goto(`/en/orders/${o.id}`);
  await dev(bctx, `/orders/${o.id}/paid`, {});
  await s.reload();
  await expect(s.getByTestId('receipt-checks')).toBeVisible();
  await expect(s.getByTestId('receipt-flag')).toContainText('Photoshop');
  await sctx.close(); await bctx.close();
});
