import { test, expect } from '@playwright/test';
import { signupAndLogin, uniq } from './util';

const lastEmail = async (page: import('@playwright/test').Page, to: string, template: string) => {
  const r = await page.request.get(`/v1/dev/outbox?to=${encodeURIComponent(to)}&template=${template}`);
  const m = await r.json();
  expect(m.found, `no ${template} email to ${to}`).toBe(true);
  return new URL(String(m.params.link));
};

test('forgot password: email link sets a new password and signs out everywhere', async ({ page, browser }) => {
  const a = await signupAndLogin(page);
  const other = await browser.newContext(); const p2 = await other.newPage();
  await p2.goto('/en/login');
  await p2.getByTestId('forgot-link').click();
  await expect(p2.getByTestId('forgot-submit')).toBeVisible();
  await p2.getByLabel('Email').fill(a.email.toUpperCase());
  await p2.getByTestId('forgot-submit').click();
  await expect(p2.getByTestId('forgot-sent')).toBeVisible();
  // Unknown addresses get the same answer.
  const r = await p2.request.post('/v1/auth/password/forgot', { data: { email: `nobody-${uniq()}@example.com` }, headers: { 'idempotency-key': uniq() } });
  expect(await r.json()).toEqual({ ok: true });

  const link = await lastEmail(p2, a.email, 'password_reset');
  expect(link.pathname).toBe('/reset-password');
  await p2.goto(`/en/reset-password${link.search}`);
  await p2.getByLabel('New password', { exact: true }).fill('a brand new passphrase');
  await p2.getByLabel('Repeat new password').fill('a brand new passphrasX');
  await expect(p2.getByTestId('pw-differ')).toBeVisible();
  await expect(p2.getByTestId('reset-submit')).toBeDisabled();
  await p2.getByLabel('Repeat new password').fill('a brand new passphrase');
  await p2.getByTestId('reset-submit').click();
  await expect(p2.getByTestId('reset-done')).toBeVisible();

  // The first browser was signed out; the old password no longer works, the new one does.
  expect((await page.request.get('/v1/auth/me')).status()).toBe(401);
  const old = await p2.request.post('/v1/auth/login', { data: { email: a.email, password: a.password }, headers: { 'idempotency-key': uniq() } });
  expect(old.status()).toBe(401);
  await p2.goto('/en/login');
  await p2.getByLabel('Email').fill(a.email);
  await p2.getByLabel('Password').fill('a brand new passphrase');
  await p2.getByTestId('login-submit').click();
  await expect(p2.getByTestId('nav-wallet')).toBeVisible({ timeout: 15_000 });
  // The link only works once.
  const again = await p2.request.post('/v1/auth/password/reset', { data: { token: link.searchParams.get('token'), password: 'yet another passphrase' }, headers: { 'idempotency-key': uniq() } });
  expect(again.status()).toBe(401);
  await other.close();
});

test('unconfirmed email: banner and resend link', async ({ page }) => {
  const email = `e2e-${uniq()}@example.com`; const password = 'correct horse battery';
  const s = await page.request.post('/v1/auth/signup', { data: { email, password, country: 'DE' }, headers: { 'idempotency-key': uniq() } });
  expect(s.ok()).toBeTruthy();
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-wallet')).toBeVisible({ timeout: 15_000 });
  await page.goto('/en/account');
  await expect(page.getByTestId('email-unverified')).toBeVisible();
  await page.getByTestId('resend-email').click();
  await expect(page.getByTestId('email-unverified')).toContainText('Sent');
  const link = await lastEmail(page, email, 'email_verify');
  await page.goto(`/en/verify-email${link.search}`);
  await expect(page.getByTestId('verified')).toBeVisible();
  await page.goto('/en/account');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('email-unverified')).toHaveCount(0);
});
