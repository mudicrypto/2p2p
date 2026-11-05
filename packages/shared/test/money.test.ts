import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toMinor, fromMinor, applyBps, cryptoToFiat, fiatToCrypto, parsePrice, medianBig, divRound, applyMargin } from '../src';

describe('money', () => {
  it('parses and formats', () => {
    expect(toMinor('1.5', 6)).toBe(1_500_000n);
    expect(toMinor('0.00000001', 8)).toBe(1n);
    expect(toMinor('1', 18)).toBe(10n ** 18n);
    expect(fromMinor(1_500_000n, 6)).toBe('1.5');
    expect(fromMinor(1n, 18)).toBe('0.000000000000000001');
    expect(fromMinor(-150n, 2)).toBe('-1.5');
    expect(() => toMinor('1.1234567', 6)).toThrow();
    expect(() => toMinor('1e5', 6)).toThrow();
    expect(() => toMinor('abc', 6)).toThrow();
  });
  it('roundtrips for all bigints', () => {
    fc.assert(fc.property(fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }), fc.integer({ min: 0, max: 18 }), (v, d) => {
      expect(toMinor(fromMinor(v, d), d)).toBe(v);
    }));
  });
  it('bps and rounding', () => {
    expect(applyBps(1_000_000n, 10)).toBe(1_000n);
    expect(applyBps(999n, 10)).toBe(0n);
    expect(applyBps(999n, 10, 'ceil')).toBe(1n);
    expect(divRound(5n, 2n, 'half_up')).toBe(3n);
    expect(applyMargin(100_000_000n, 150)).toBe(101_500_000n);
  });
  it('crypto<->fiat conversion never over-delivers crypto', () => {
    fc.assert(fc.property(fc.bigInt({ min: 1n, max: 10n ** 15n }), fc.bigInt({ min: 1n, max: 10n ** 20n }), (fiat, price) => {
      const c = fiatToCrypto(fiat, price, 6);
      // The crypto delivered is worth at most what was paid.
      expect(c * price <= fiat * 10n ** 6n * 10n ** 8n).toBe(true);
    }));
    const price = parsePrice('92.50', 2); // RUB per USDT
    expect(cryptoToFiat(toMinor('100', 6), price, 6)).toBe(925_000n);
    expect(fiatToCrypto(925_000n, price, 6)).toBe(100_000_000n);
  });
  it('median', () => {
    expect(medianBig([3n, 1n, 2n])).toBe(2n);
    expect(medianBig([4n, 1n, 2n, 3n])).toBe(2n);
  });
});
