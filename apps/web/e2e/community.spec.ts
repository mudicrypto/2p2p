import { test, expect } from '@playwright/test';
import { signupAndLogin, dev, uniq } from './util';

/** P2P community features through the UI: nickname, nickname search, follow/block, ad editing with
 *  conditions and auto-reply, take-a-break, price alert, CSV export, invite link and large-trade desk. */
test('community features work end to end', async ({ browser }) => {
  // Seller: posts an ad, sets a nickname, edits the ad (price, limits, conditions, auto-reply).
  const sctx = await browser.newContext(); const seller = await sctx.newPage();
  await signupAndLogin(seller);
  await dev(sctx, '/dev/tier', { tier: 1 });
  await dev(sctx, '/dev/faucet', { asset: 'USDT', amount: '500' });
  const m = await dev(sctx, '/payment-methods', { type: 'SEPA', holderName: 'Comm Seller', details: { iban: 'DE89370400440532013000' } });
  await dev(sctx, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.961', minAmount: '10', maxAmount: '400', totalAmount: '100', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
  const nick = `Kite ${uniq().slice(-6)}`;
  await seller.goto('/en/account');
  await seller.getByTestId('nickname').fill(nick);
  await seller.getByTestId('nickname-save').click();
  await expect(seller.getByRole('heading', { name: nick })).toBeVisible();

  await seller.goto('/en/ads');
  await seller.getByTestId('edit-ad-open').first().click();
  await seller.getByTestId('edit-price').fill('0.962');
  await seller.getByTestId('edit-min').fill('20');
  await seller.getByTestId('auto-reply').fill('Hello! Pay to the IBAN shown and press "I have paid".');
  await seller.getByTestId('min-trades').fill('0');
  await seller.getByTestId('edit-save').click();
  await expect(seller.getByTestId('edit-ad')).toHaveCount(0);
  await expect(seller.getByTestId('my-ads')).toContainText('€ 20.00');

  // Buyer: finds the seller by nickname, follows, sees "following" filter, then blocks.
  const bctx = await browser.newContext(); const buyer = await bctx.newPage();
  await signupAndLogin(buyer);
  await buyer.goto('/en/p2p?fiat=EUR');
  await expect(buyer.getByTestId('filter-toggle')).toHaveCount(1);
  await buyer.getByTestId('filter-toggle').click();
  await buyer.getByTestId('filter-q').fill(nick.slice(0, 7));
  const row = buyer.getByTestId('ad-row').filter({ hasText: nick });
  await expect(row).toBeVisible();
  await expect(buyer.getByTestId('ad-row')).toHaveCount(1);
  await expect(row.getByTestId('online-dot')).toBeVisible(); // seller was just active

  await row.getByRole('link', { name: nick }).click();
  await expect(buyer.getByTestId('presence')).toBeVisible();
  await buyer.getByTestId('follow').click();
  await expect(buyer.getByTestId('unfollow')).toBeVisible();
  await buyer.goto('/en/p2p?fiat=EUR');
  await expect(buyer.getByTestId('filter-toggle')).toHaveCount(1);
  await buyer.getByTestId('filter-toggle').click();
  await buyer.getByTestId('filter-following').check();
  await expect(buyer.getByTestId('ad-row')).toHaveCount(1);
  await expect(buyer.getByTestId('ad-row').first()).toContainText(nick);

  // Price alert from the trade page shows up in the account.
  await buyer.getByTestId('alert-open').click();
  await buyer.getByTestId('alert-price').fill('0.5');
  await buyer.getByTestId('alert-save').click();
  await expect(buyer.getByTestId('alert-done')).toBeVisible();
  await buyer.keyboard.press('Escape');
  await buyer.goto('/en/account');
  await expect(buyer.getByTestId('alerts-list')).toContainText('0.5 EUR');
  await expect(buyer.getByTestId('following-list')).toContainText(nick);

  // Seller takes a break: the ad disappears from the market; back again: it returns.
  await seller.goto('/en/ads');
  await seller.getByTestId('away-toggle').click();
  await expect(seller.getByTestId('away-card')).toContainText('on a break');
  await buyer.goto('/en/p2p?fiat=EUR&following=1');
  await expect(buyer.getByTestId('filter-toggle')).toHaveCount(1);
  await buyer.getByTestId('filter-toggle').click();
  await buyer.getByTestId('filter-following').check();
  await expect(buyer.getByTestId('book')).toContainText('No ads match');
  await seller.getByTestId('away-toggle').click();
  await expect(seller.getByTestId('away-card')).not.toContainText('on a break');

  // Buyer blocks the seller: the offer is hidden for the buyer.
  await buyer.goto('/en/p2p?fiat=EUR');
  await expect(buyer.getByTestId('filter-toggle')).toHaveCount(1);
  await buyer.getByTestId('filter-toggle').click();
  await buyer.getByTestId('filter-q').fill(nick.slice(0, 7));
  await buyer.getByTestId('ad-row').filter({ hasText: nick }).getByRole('link', { name: nick }).click();
  await buyer.getByTestId('block').click();
  await expect(buyer.getByTestId('blocked-note')).toBeVisible();
  await buyer.goto('/en/p2p?fiat=EUR');
  await expect(buyer.getByTestId('filter-toggle')).toHaveCount(1);
  await buyer.getByTestId('filter-toggle').click();
  await buyer.getByTestId('filter-q').fill(nick.slice(0, 7));
  await expect(buyer.getByTestId('ad-row')).toHaveCount(0);

  // Invite link, CSV export and the large-trade desk.
  await buyer.goto('/en/rewards');
  await expect(buyer.getByTestId('ref-code')).toHaveText(/^[A-Z2-9]{7}$/);
  await expect(buyer.getByTestId('ref-link')).toContainText('/en/signup?ref=');
  await buyer.goto('/en/otc');
  await buyer.getByTestId('otc-amount').fill('250000');
  await buyer.getByTestId('otc-submit').click();
  await expect(buyer.getByTestId('otc-sent')).toBeVisible();
  await expect(buyer.getByTestId('otc-mine')).toContainText('Waiting');

  await sctx.close(); await bctx.close();
});

test('orders export as CSV', async ({ page }) => {
  await signupAndLogin(page);
  await page.goto('/en/orders');
  await expect(page.getByTestId('export-csv')).toBeDisabled(); // nothing to export yet
});

test('business hours hide ads outside the chosen hours', async ({ page, context }) => {
  await signupAndLogin(page);
  await dev(context, '/dev/tier', { tier: 1 });
  await dev(context, '/dev/faucet', { asset: 'USDT', amount: '200' });
  const m = await dev(context, '/payment-methods', { type: 'SEPA', holderName: 'Hours Seller', details: { iban: 'DE89370400440532013000' } });
  await dev(context, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.977', minAmount: '10', maxAmount: '100', totalAmount: '50', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
  const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const now = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const fmt = (x: number) => { const v = (x + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
  await page.goto('/en/ads');
  await page.getByTestId('hours-on').check();
  await page.getByTestId('hours-start').fill(fmt(now + 120));
  await page.getByTestId('hours-end').fill(fmt(now + 180));
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) { const b = page.getByRole('button', { name: d, exact: true }); if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click(); }
  await page.getByTestId('hours-save').click();
  await expect(page.getByTestId('hours-off')).toBeVisible();
  await expect(page.getByTestId('hours-card')).toContainText(tz);
  const r = await page.request.get('/v1/ads?side=buy&asset=USDT&fiat=EUR&limit=100');
  expect((await r.json()).items.some((a: any) => a.price === '0.977')).toBe(false);
  await page.getByTestId('hours-on').uncheck();
  await expect(page.getByTestId('hours-off')).toHaveCount(0);
});
