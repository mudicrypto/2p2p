import { test, expect } from '@playwright/test';
import { signupAndLogin, dev } from './util';

/** Offer filters on the Trade page: payment method, ID-verified traders only, sorting, clearing. */
test('offer filters narrow the order book', async ({ browser }) => {
  async function seller(tier: number, pm: { type: string; details: Record<string, string> }, price: string) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await signupAndLogin(page);
    await dev(ctx, '/dev/tier', { tier });
    await dev(ctx, '/dev/faucet', { asset: 'USDT', amount: '500' });
    const m = await dev(ctx, '/payment-methods', { type: pm.type, holderName: 'Filter Seller', details: pm.details });
    await dev(ctx, '/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price, minAmount: '10', maxAmount: '400', totalAmount: '100', paymentMethodIds: [m.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 });
    await ctx.close();
  }
  await seller(1, { type: 'SEPA', details: { iban: 'DE89370400440532013000' } }, '0.951'); // ID-verified, SEPA
  await seller(0, { type: 'WISE', details: { email: 'wise@example.com' } }, '0.993');      // unverified, Wise

  const page = await browser.newPage();
  await page.goto('/en/p2p?fiat=EUR');
  const row = (price: string) => page.getByTestId('ad-row').filter({ has: page.getByTestId('ad-price').getByText(price, { exact: true }) });
  await expect(row('0.951')).toBeVisible();
  await expect(row('0.993')).toBeVisible();

  await page.getByTestId('filter-toggle').click();
  await page.getByTestId('filter-pm').selectOption('WISE');
  await expect(row('0.993')).toBeVisible();
  await expect(row('0.951')).toHaveCount(0);

  await page.getByTestId('filter-clear').click();
  await page.getByTestId('filter-verified').check();
  await expect(row('0.951')).toBeVisible();
  await expect(row('0.993')).toHaveCount(0);

  await page.getByTestId('filter-sort').selectOption('trades');
  await expect(row('0.951')).toBeVisible();
  await page.getByTestId('filter-clear').click();
  await expect(row('0.993')).toBeVisible();
});
