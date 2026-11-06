import { test, expect, request as pwRequest } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';

const API = 'http://localhost:4000';
/** Telegram WebApp initData signing (same algorithm Telegram uses; server validates with the bot token). */
function signInitData(fields: Record<string, string>, botToken = 'mock-bot-token') {
  const dcs = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}

test('full trade flow inside the Telegram Mini App', async ({ page }) => {
  // ---- seller (via API)
  const api = await pwRequest.newContext({ baseURL: API });
  const idem = () => ({ 'idempotency-key': randomUUID() });
  const email = `tg-seller-${Date.now()}@example.com`;
  const s = await (await api.post('/v1/auth/signup', { data: { email, password: 'correct horse battery', country: 'DE' }, headers: idem() })).json();
  await api.post('/v1/auth/verify-email', { data: { token: s.devEmailToken }, headers: idem() });
  let l = await (await api.post('/v1/auth/login', { data: { email, password: 'correct horse battery', deviceFingerprint: randomUUID() } })).json();
  let auth = { authorization: `Bearer ${l.token}` };
  const setup = await (await api.post('/v1/auth/2fa/setup', { headers: { ...auth, ...idem() } })).json();
  await api.post('/v1/auth/2fa/confirm', { data: { code: authenticator.generate(setup.secret) }, headers: { ...auth, ...idem() } });
  l = await (await api.post('/v1/auth/login', { data: { email, password: 'correct horse battery', totp: authenticator.generate(setup.secret), deviceFingerprint: randomUUID() } })).json();
  auth = { authorization: `Bearer ${l.token}` };
  await api.post('/v1/dev/tier', { data: { tier: 1 }, headers: { ...auth, ...idem() } });
  await api.post('/v1/dev/faucet', { data: { asset: 'USDT', amount: '500' }, headers: { ...auth, ...idem() } });
  const pm = await (await api.post('/v1/payment-methods', { data: { type: 'SEPA', holderName: 'Tg Seller', details: { iban: 'DE89370400440532013000' } }, headers: { ...auth, ...idem() } })).json();
  const ad = await (await api.post('/v1/ads', { data: { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.91', minAmount: '5', maxAmount: '400', totalAmount: '400', paymentMethodIds: [pm.id] }, headers: { ...auth, ...idem() } })).json();
  expect(ad.id).toBeTruthy();

  // ---- buyer inside Telegram
  const tgUser = JSON.stringify({ id: Math.floor(Math.random() * 1e9), first_name: 'Tg', username: `buyer${Date.now()}`, language_code: 'en' });
  const initData = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE', user: tgUser });
  await page.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript((data) => {
    (window as any).Telegram = { WebApp: { initData: data, ready() {}, expand() {}, themeParams: { bg_color: '#ffffff', button_color: '#2481cc', button_text_color: '#ffffff' }, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } };
  }, initData);
  await page.goto('/en');
  await page.getByTestId('tg-country').fill('DE');
  await page.getByTestId('tg-continue').click();
  await page.getByTestId('fiat').selectOption('EUR');
  const row = page.getByTestId('ad-row').filter({ hasText: '0.91' }).first();
  await row.getByTestId('trade').click();
  await page.getByTestId('trade-amount').fill('91');
  await page.getByTestId('place-order').click();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'AWAITING_PAYMENT');
  const orderId = page.url().split('/').pop()!;
  await page.getByTestId('mark-paid').click();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PAID');

  // seller releases with 2FA via the API; the Mini App updates in realtime
  // The current code was spent on login (replay-protected); use the next time-step's code (server accepts ±1 step).
  const rel = await api.post(`/v1/orders/${orderId}/release`, { data: { totp: authenticator.clone({ epoch: Date.now() + 30_000 }).generate(setup.secret) }, headers: { ...auth, ...idem() } });
  expect(rel.ok(), await rel.text()).toBeTruthy();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'COMPLETED');
  await page.getByTestId('tg-tab-nav.wallet').click();
  await expect(page.getByTestId('avail-USDT')).toHaveText('100');
});
