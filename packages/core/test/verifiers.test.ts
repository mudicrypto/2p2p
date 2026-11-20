import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { kycApplications, orders, eq } from '@p2p/db';
import { createRailAdapter, hmacOk, MockPaymentVerifier, VERIFIER_RAILS } from '@p2p/providers';
import { createHmac } from 'node:crypto';
import { makeCtx, mkUser, fund, ensureSeed, uniq } from './helpers';
import { addPaymentMethod, createAd, createOrder, markPaid, handlePaymentWebhook, verifyOrderPayment, encrypt, balanceOf, userAcct, fromMinorSafe, type Order } from './verifiers.helpers';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

const RAIL: Record<string, { fiat: string; details: Record<string, string> }> = {
  PIX: { fiat: 'BRL', details: { pixKey: 'seller@pix.br' } }, UPI: { fiat: 'INR', details: { vpa: 'seller@okhdfc' } },
  SEPA_INSTANT: { fiat: 'EUR', details: { iban: 'DE89370400440532013000' } }, FASTER_PAYMENTS: { fiat: 'GBP', details: { sortCode: '12-34-56', accountNumber: '12345678' } },
  SPEI: { fiat: 'MXN', details: { clabe: '012345678901234567' } }, SBP: { fiat: 'RUB', details: { phone: '+79161234567', bankName: 'Tinkoff' } },
  MPESA: { fiat: 'KES', details: { phone: '+254712345678' } }, PROMPTPAY: { fiat: 'THB', details: { promptpayId: '0812345678' } },
};
/** Build the provider's own notification format for a payment. */
function providerPayload(rail: string, o: Order, payer: string): string {
  const amt = fromMinorSafe(o.fiatAmount, 2);
  const ref = `ORDER ${o.referenceCode}`;
  const [first, ...rest] = payer.split(' ');
  switch (rail) {
    case 'PIX': return JSON.stringify({ pix: [{ endToEndId: uniq('E'), txid: o.referenceCode, valor: amt, horario: new Date().toISOString(), infoPagador: ref, pagador: { nome: payer } }] });
    case 'UPI': return JSON.stringify({ payload: { payment: { entity: { id: uniq('pay_'), amount: Number(o.fiatAmount), currency: 'INR', description: ref, notes: { payer_name: payer } } } } });
    case 'SEPA_INSTANT': case 'FASTER_PAYMENTS': return JSON.stringify({ transaction: { transactionId: uniq('tx'), transactionAmount: { amount: amt, currency: RAIL[rail].fiat }, remittanceInformationUnstructured: ref, debtorName: payer, bookingDate: new Date().toISOString() } });
    case 'SPEI': return JSON.stringify({ id: uniq(''), claveRastreo: uniq('MBAN'), monto: Number(amt), nombreOrdenante: payer, conceptoPago: ref, fechaOperacion: Date.now() });
    case 'SBP': return JSON.stringify({ operationId: uniq('B'), amount: amt, purpose: ref, payerName: payer });
    case 'MPESA': return JSON.stringify({ TransID: uniq('RKT'), TransAmount: amt, BillRefNumber: o.referenceCode, FirstName: first, LastName: rest.join(' '), TransTime: '20261105120000' });
    case 'PROMPTPAY': return JSON.stringify({ transactionId: uniq('pp'), amount: amt, billPaymentRef1: o.referenceCode, payerName: payer });
  }
  throw new Error(rail);
}
async function setupOrder(rail: string) {
  const seller = await mkUser(ctx, { tier: 2 });
  await fund(ctx, seller, 'USDT', '100');
  const pm = await addPaymentMethod(ctx, seller, { type: rail, holderName: 'Seller Name', details: RAIL[rail].details });
  const ad = await createAd(ctx, seller, { side: 'sell', asset: 'USDT', fiat: RAIL[rail].fiat, priceType: 'fixed', price: '10', minAmount: '1', maxAmount: '100000', totalAmount: '50', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
  const buyer = await mkUser(ctx, { tier: 1 });
  await ctx.db.insert(kycApplications).values({ userId: buyer.id, provider: 'mock', providerRef: uniq('k'), level: 1, status: 'approved', verifiedFullNameEnc: encrypt('Maria Fernanda Costa'), reviewedAt: new Date() });
  const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '5' });
  return { seller, buyer, o };
}
const statusOf = async (id: string) => (await ctx.db.select().from(orders).where(eq(orders.id, id)))[0].status;

describe('M10 payment auto-confirmation', () => {
  for (const rail of VERIFIER_RAILS) {
    it(`${rail}: real adapter payload → auto-release on full match; mismatched payer name blocks release`, async () => {
      process.env[`${rail}_WEBHOOK_SECRET`] = 'sandbox-secret';
      const adapter = createRailAdapter(rail)!;
      ctx.providers.verifiers.set(rail, adapter);
      const sigHeader = (adapter as any).sigHeader as string;
      const send = (body: string, good = true) => handlePaymentWebhook(ctx, rail, body, { [sigHeader]: good ? createHmac('sha256', 'sandbox-secret').update(body).digest('hex') : 'bad' });

      const a = await setupOrder(rail);
      await expect(send(providerPayload(rail, a.o, 'COSTA MARIA FERNANDA'), false)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      const r = await send(providerPayload(rail, a.o, 'COSTA MARIA FERNANDA'));
      expect(r.outcome).toBe('auto_released');
      expect(await statusOf(a.o.id)).toBe('COMPLETED');
      expect(await balanceOf(ctx.db, userAcct(a.buyer.id, 'USDT'))).toBe(5_000_000n);

      const b = await setupOrder(rail);
      await markPaid(ctx, b.buyer, b.o.id);
      const r2 = await send(providerPayload(rail, b.o, 'Joao Pereira Lima'));
      expect(r2.outcome).toBe('third_party_flagged');
      expect(await statusOf(b.o.id)).toBe('DISPUTED');
      expect(await balanceOf(ctx.db, userAcct(b.buyer.id, 'USDT'))).toBe(0n);
      delete process.env[`${rail}_WEBHOOK_SECRET`];
    });
    it(`${rail}: mock verifier polling path auto-releases`, async () => {
      ctx.providers.verifiers.set(rail, new MockPaymentVerifier(rail, ctx.providers.mocks!.paymentInbox));
      const a = await setupOrder(rail);
      expect(await verifyOrderPayment(ctx, a.o.id)).toBeNull(); // nothing arrived yet
      ctx.providers.mocks!.paymentInbox.push({ rail, fiat: a.o.fiat, amount: a.o.fiatAmount, reference: `pay ${a.o.referenceCode}`, payerName: 'Maria F. Costa' });
      const r = await verifyOrderPayment(ctx, a.o.id);
      expect(r?.outcome).toBe('auto_released');
    });
  }
  it('signature helper is constant-time and rejects missing secrets', () => {
    expect(hmacOk(undefined, 'x', 'y')).toBe(false);
  });
});
