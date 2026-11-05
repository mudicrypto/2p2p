import { test, expect } from '@playwright/test';
import { signupAndLogin, enable2fa, code, dev } from './util';

test('full trade flow in the browser: post ad, buy, chat, pay, release, feedback', async ({ browser }) => {
  // ---------------- seller / maker
  const sCtx = await browser.newContext();
  const seller = await sCtx.newPage();
  const s = await signupAndLogin(seller);
  await enable2fa(seller, s);
  await dev(sCtx, '/dev/tier', { tier: 1 }); // the KYC tier-up flow is covered by kyc e2e tests
  await seller.goto('/en/wallet');
  await seller.getByTestId('faucet').click();
  await expect(seller.getByTestId('avail-USDT')).toHaveText('1,000');
  await seller.getByTestId('pm-type').selectOption('SEPA');
  await seller.getByTestId('pm-holder').fill('Seller Person');
  await seller.getByTestId('pm-field-iban').fill('DE89370400440532013000');
  await seller.getByTestId('pm-add').click();
  await expect(seller.getByText('SEPA · Seller Person')).toBeVisible();

  await seller.goto('/en/ads/new');
  await seller.getByLabel('Price per unit').fill('0.97');
  await seller.getByLabel('Total amount (USDT)').fill('500');
  await seller.getByLabel('Min order (EUR)').fill('10');
  await seller.getByLabel('Max order (EUR)').fill('400');
  await seller.getByTestId('pm-SEPA').check();
  await seller.getByLabel('Terms').fill('SEPA only, include the reference code.');
  await seller.getByTestId('publish-ad').click();
  await expect(seller).toHaveURL(/\/en\/wallet/);

  // ---------------- buyer / taker
  const bCtx = await browser.newContext();
  const buyer = await bCtx.newPage();
  await signupAndLogin(buyer);
  await buyer.goto('/en');
  await buyer.getByTestId('fiat').selectOption('EUR');
  const row = buyer.getByTestId('ad-row').filter({ hasText: '0.97' }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('trade').click();
  await buyer.getByTestId('trade-amount').fill('97');
  await buyer.getByTestId('place-order').click();
  await expect(buyer.getByTestId('order-status')).toHaveAttribute('data-status', 'AWAITING_PAYMENT');
  await expect(buyer.getByTestId('reference')).toHaveText(/^P2P[A-Z2-9]{8}$/);
  await expect(buyer.getByText('iban: DE89370400440532013000')).toBeVisible();
  const orderUrl = buyer.url();

  // chat + off-platform filter
  await buyer.getByTestId('chat-input').fill('Hello, sending SEPA now');
  await buyer.getByTestId('chat-send').click();
  await expect(buyer.getByTestId('chat-log')).toContainText('Hello, sending SEPA now');
  await buyer.getByTestId('chat-input').fill('or message me on whatsapp');
  await buyer.getByTestId('chat-send').click();
  await expect(buyer.getByTestId('chat-warning')).toBeVisible();

  // seller opens the order and sees the chat
  await seller.goto(orderUrl);
  await expect(seller.getByTestId('chat-log')).toContainText('Hello, sending SEPA now');
  await expect(seller.getByTestId('chat-log')).not.toContainText('whatsapp');

  await buyer.getByTestId('mark-paid').click();
  await expect(buyer.getByTestId('order-status')).toHaveAttribute('data-status', 'PAID');
  await expect(seller.getByTestId('order-status')).toHaveAttribute('data-status', 'PAID'); // realtime push

  await seller.getByTestId('release-totp').fill('000000');
  await seller.getByTestId('release').click();
  await expect(seller.getByTestId('error')).toBeVisible();
  await seller.getByTestId('release-totp').fill(code(s));
  await seller.getByTestId('release').click();
  await expect(seller.getByTestId('order-status')).toHaveAttribute('data-status', 'COMPLETED');
  await expect(buyer.getByTestId('order-status')).toHaveAttribute('data-status', 'COMPLETED');

  await buyer.getByTestId('feedback-positive').click();
  await expect(buyer.getByTestId('feedback-thanks')).toBeVisible();
  await buyer.goto('/en/wallet');
  await expect(buyer.getByTestId('avail-USDT')).toHaveText('100');
  await seller.goto('/en/wallet');
  await expect(seller.getByTestId('avail-USDT')).toHaveText('899.9');
});

test('arabic renders right-to-left @mobile', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});
