import { describe, it, expect } from 'vitest';
import { createProviders, mockSign } from '../src';

describe('mock providers', () => {
  const p = createProviders('mock');
  it('custody: deterministic addresses and signed deposit webhooks', async () => {
    const a = await p.custody.createDepositAddress('u1', 'USDT', 'TRON');
    expect(a.address.startsWith('T')).toBe(true);
    const wh = p.mocks!.custody.simulateDeposit({ network: 'TRON', asset: 'USDT', address: a.address, txHash: 'h1', amount: 5n, confirmations: 20 });
    expect(p.custody.verifyWebhook(wh.body, wh.headers)).toBe(true);
    expect(p.custody.verifyWebhook(wh.body, { 'x-mock-signature': 'bad' })).toBe(false);
    expect(p.custody.parseWebhook(wh.body)!.amount).toBe(5n);
    expect(await p.custody.getBalance('USDT')).toBe(5n);
  });
  it('kyc: review webhook roundtrip', async () => {
    const s = await p.kyc.createApplicant('u1', 1);
    const wh = p.mocks!.kyc.simulateReview(s.providerRef, { status: 'approved', fullName: 'Ana Silva' });
    expect(p.kyc.verifyWebhook(wh.body, wh.headers)).toBe(true);
    expect(p.kyc.parseWebhook(wh.body)).toMatchObject({ status: 'approved', level: 1, fullName: 'Ana Silva' });
  });
  it('chain risk flags sanctioned addresses and names', async () => {
    expect((await p.chainRisk.screenAddress('TRON', 'Tdead00xyz')).sanctioned).toBe(true);
    expect((await p.personScreen.screenPerson({ fullName: 'John Sanction', country: 'US' })).hit).toBe(true);
  });
  it('rates: three sources', async () => {
    const qs = await Promise.all(p.rateSources.map((s) => s.fetch('USDT', 'EUR')));
    expect(qs.filter(Boolean)).toHaveLength(3);
  });
  it('signatures are hex hmac', () => expect(mockSign('x')).toMatch(/^[0-9a-f]{64}$/));
});
