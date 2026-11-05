import { expect, type BrowserContext, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export interface Acct { email: string; password: string; secret?: string }

/** Sign up, verify via the dev link, log in — all through the UI. */
export async function signupAndLogin(page: Page, country = 'DE'): Promise<Acct> {
  const a = { email: `e2e-${uniq()}@example.com`, password: 'correct horse battery' };
  await page.goto('/en/signup');
  await page.getByLabel('Email').fill(a.email);
  await page.getByLabel('Password').fill(a.password);
  await page.getByLabel('Country of residence').fill(country);
  await page.getByTestId('signup-submit').click();
  await page.getByTestId('dev-verify-link').click();
  await expect(page.getByTestId('verified')).toBeVisible();
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(a.email);
  await page.getByLabel('Password').fill(a.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-wallet')).toBeVisible();
  return a;
}
export async function enable2fa(page: Page, a: Acct) {
  await page.goto('/en/wallet');
  await page.getByTestId('totp-setup').click();
  a.secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByTestId('totp-code').fill(authenticator.generate(a.secret));
  await page.getByTestId('totp-enable').click();
  await expect(page.getByText('2FA is enabled')).toBeVisible();
}
export const code = (a: Acct) => authenticator.generate(a.secret!);

/** Call a mock-only dev endpoint with the browser session (cookie + CSRF). */
export async function dev(ctx: BrowserContext, path: string, body: unknown) {
  const csrf = (await ctx.cookies()).find((c) => c.name === 'csrf')?.value ?? '';
  const r = await ctx.request.post(`/v1${path}`, { data: body, headers: { 'x-csrf-token': decodeURIComponent(csrf), 'idempotency-key': uniq() } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
