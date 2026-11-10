import { describe, expect, it } from 'vitest';
import { cleanDecimal, cryptoFor, fiatFor, fromScaled, inRange, toScaled } from '../src/decimal';
import { formatDecimal, formatMoney, pickLocale, translate } from '../src/i18n';
import { LOCALES, MESSAGES } from '../src/locales';

describe('decimal (no floats)', () => {
  it('converts fiat <-> crypto exactly', () => {
    expect(cryptoFor('93', '0.93')).toBe('100');
    expect(fiatFor('100', '0.93')).toBe('93');
    expect(cryptoFor('10', '3')).toBe('3.333333');
    expect(fiatFor('0.1', '0.2')).toBe('0.02'); // 0.1*0.2 is 0.020000000000000004 in floats
  });
  it('range checks and cleaning', () => {
    expect(inRange('10', '10', '400')).toBe(true);
    expect(inRange('400.01', '10', '400')).toBe(false);
    expect(cleanDecimal('1,5a.2')).toBe('1.52');
    expect(fromScaled(toScaled('123.456789'), 3)).toBe('123.456');
  });
});

describe('mobile i18n', () => {
  it('every locale is bundled and translates ui keys', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LOCALES].sort());
    for (const l of LOCALES) expect(translate(l, 'ui.hero1')).not.toBe('ui.hero1');
    expect(translate('de', 'ui.level', { n: 2 })).toBe('Stufe 2');
  });
  it('formats without float rounding', () => {
    expect(formatDecimal('en', '12345678901234567890.123456789', 8)).toBe('12,345,678,901,234,567,890.12345678');
    expect(formatDecimal('de', '1000.5')).toBe('1.000,5');
    expect(formatMoney('en', '93', 'EUR')).toBe('€ 93.00');
  });
  it('picks a supported locale', () => {
    expect(pickLocale('pt-BR')).toBe('pt');
    expect(pickLocale('zh-TW')).toBe('zh-Hant');
    expect(pickLocale('tl-PH')).toBe('fil');
    expect(pickLocale('xx')).toBe('en');
  });
});
