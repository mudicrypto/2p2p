import { test, expect } from '@playwright/test';
test('status page shows component health; legal pages render from the footer', async ({ page }) => {
  await page.goto('/en/status');
  await expect(page.getByTestId('status-overall')).toBeVisible();
  await expect(page.getByText('Withdrawals')).toBeVisible();
  for (const [link, title] of [['Terms of service', 'Terms of Service'], ['Privacy policy', 'Privacy Policy'], ['Risk disclosure', 'Risk Disclosure']]) {
    await page.goto('/de');
    await page.getByRole('link', { name: { 'Terms of service': 'Nutzungsbedingungen', 'Privacy policy': 'Datenschutzerklärung', 'Risk disclosure': 'Risikohinweis' }[link]! }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByText('Maßgeblich ist die englische Fassung.')).toBeVisible();
  }
});
