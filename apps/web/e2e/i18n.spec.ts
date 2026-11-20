import { test, expect } from '@playwright/test';
import { LOCALES, RTL_LOCALES } from '@p2p/i18n';

const KEY_LEAK = /\b(app|nav|market|trade|order|chat|ad|wallet|auth|profile|notifications|common|errors)\.[a-zA-Z]+\b/;

for (const l of LOCALES) {
  test(`${l}: pages render translated with correct direction @mobile`, async ({ page }) => {
    for (const path of ['', '/login', '/signup']) {
      await page.goto(`/${l}${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', l);
      await expect(page.locator('html')).toHaveAttribute('dir', RTL_LOCALES.has(l) ? 'rtl' : 'ltr');
      await expect(page.locator('main')).toBeVisible();
      const text = await page.locator('body').innerText();
      expect(text, `untranslated key on /${l}${path}`).not.toMatch(KEY_LEAK);
      // No horizontal overflow (catches broken RTL/long-string layouts on phones).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on /${l}${path}`).toBeLessThanOrEqual(1);
    }
  });
}
