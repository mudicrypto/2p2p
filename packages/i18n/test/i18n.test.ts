import { describe, it, expect } from 'vitest';
import { LOCALES, RTL_LOCALES, dir, loadMessages, translate, formatDecimal, formatMoney, enMessages } from '../src';

const flat = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
describe('i18n', () => {
  it('every locale has every key, translated (not English) for most strings, placeholders intact', async () => {
    const keys = flat(enMessages);
    for (const l of LOCALES) {
      const m = await loadMessages(l);
      expect(flat(m).sort(), l).toEqual([...keys].sort());
      if (l === 'en') continue;
      const same = keys.filter((k) => translate(m, k) === translate(enMessages, k)).length;
      expect(same / keys.length, `${l} untranslated ratio`).toBeLessThan(0.25);
      for (const k of keys) expect((translate(m, k).match(/\{\w+\}/g) ?? []).sort(), `${l}:${k}`).toEqual((translate(enMessages, k).match(/\{\w+\}/g) ?? []).sort());
    }
  });
  it('RTL for ar/fa/ur only', () => {
    expect([...RTL_LOCALES].sort()).toEqual(['ar', 'fa', 'ur']);
    expect(dir('ar')).toBe('rtl'); expect(dir('de')).toBe('ltr');
  });
  it('formats amounts by locale without float loss', () => {
    expect(formatDecimal('en', '1234567.89')).toBe('1,234,567.89');
    expect(formatDecimal('de', '1234567.89')).toBe('1.234.567,89');
    expect(formatDecimal('hi', '1234567.5')).toBe('12,34,567.5');
    expect(formatDecimal('en', '123456789012345678901234.000000000000000001')).toBe('123,456,789,012,345,678,901,234.000000000000000001');
    expect(formatDecimal('fa', '1234.5')).toMatch(/[۰-۹]/); // Persian digits (CLDR default numbering)
    expect(formatMoney('en', '92', 'EUR')).toBe('€ 92.00');
    expect(formatMoney('ja', '1500', 'JPY', 0)).toMatch(/1,500/);
  });
});
