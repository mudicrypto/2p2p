/**
 * Real PaymentVerifier adapters for rails with APIs (M10). Each maps the provider's documented
 * notification shape. All need credentials: TODO(provider) — verify field names against each sandbox.
 */
import type { IncomingPayment, PaymentCheckRequest } from '../interfaces';
import { RailVerifier, amountMinor } from './base';
import { httpJson, requireEnv } from '../real/http';

/** PIX via a PSP (Efí/Gerencianet-style webhook: { pix: [{ endToEndId, txid, valor, horario, infoPagador, pagador: { nome } }] }). */
export class PixVerifier extends RailVerifier {
  readonly rail = 'PIX'; protected secretEnv = 'PIX_WEBHOOK_SECRET';
  parseWebhook(raw: string): IncomingPayment {
    const p = JSON.parse(raw).pix[0];
    return { providerRef: p.endToEndId, rail: this.rail, fiat: 'BRL', amount: amountMinor(p.valor, 'BRL'), reference: `${p.infoPagador ?? ''} ${p.txid ?? ''}`, payerName: p.pagador?.nome ?? '', receivedAt: new Date(p.horario) };
  }
  async findPayment(req: PaymentCheckRequest) {
    const base = requireEnv('PIX_API_BASE');
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const r = await httpJson<{ pix: any[] }>(`${base}/v2/pix?inicio=${since}&fim=${new Date().toISOString()}`, { headers: { authorization: `Bearer ${requireEnv('PIX_API_TOKEN')}` } });
    const hit = (r.pix ?? []).find((p) => `${p.infoPagador ?? ''}${p.txid ?? ''}`.includes(req.referenceCode));
    return hit ? this.parseWebhook(JSON.stringify({ pix: [hit] })) : null;
  }
}
/** UPI via a PSP (Razorpay/Cashfree-style: { payload: { payment: { entity: { id, amount (paise), currency, description, vpa, notes: { payer_name } } } } }). */
export class UpiVerifier extends RailVerifier {
  readonly rail = 'UPI'; protected secretEnv = 'UPI_WEBHOOK_SECRET'; protected sigHeader = 'x-razorpay-signature';
  parseWebhook(raw: string): IncomingPayment {
    const e = JSON.parse(raw).payload.payment.entity;
    return { providerRef: e.id, rail: this.rail, fiat: e.currency ?? 'INR', amount: BigInt(e.amount), reference: `${e.description ?? ''} ${e.notes?.reference ?? ''}`, payerName: e.notes?.payer_name ?? e.upi?.payer_name ?? '', receivedAt: new Date((e.created_at ?? Date.now() / 1000) * 1000) };
  }
}
/** SEPA Instant / Faster Payments via open banking (Berlin Group / UK OB transaction shape). */
export class OpenBankingVerifier extends RailVerifier {
  protected secretEnv: string;
  constructor(readonly rail: 'SEPA_INSTANT' | 'FASTER_PAYMENTS', private fiat: 'EUR' | 'GBP') { super(); this.secretEnv = `${rail}_WEBHOOK_SECRET`; }
  parseWebhook(raw: string): IncomingPayment {
    const t = JSON.parse(raw).transaction;
    return { providerRef: t.transactionId ?? t.entryReference, rail: this.rail, fiat: t.transactionAmount.currency, amount: amountMinor(t.transactionAmount.amount, t.transactionAmount.currency), reference: t.remittanceInformationUnstructured ?? t.reference ?? '', payerName: t.debtorName ?? t.creditorName ?? '', receivedAt: new Date(t.bookingDate ?? t.valueDate ?? Date.now()) };
  }
  async findPayment(req: PaymentCheckRequest) {
    const base = requireEnv(`${this.rail}_OB_API_BASE`);
    const acct = requireEnv(`${this.rail}_OB_ACCOUNT_ID`);
    const r = await httpJson<{ transactions: { booked: any[] } }>(`${base}/accounts/${acct}/transactions?dateFrom=${new Date(Date.now() - 86400_000).toISOString().slice(0, 10)}`, { headers: { authorization: `Bearer ${requireEnv(`${this.rail}_OB_TOKEN`)}` } });
    const hit = (r.transactions?.booked ?? []).find((t) => String(t.remittanceInformationUnstructured ?? '').includes(req.referenceCode) && t.transactionAmount?.currency === this.fiat);
    return hit ? this.parseWebhook(JSON.stringify({ transaction: hit })) : null;
  }
}
/** SPEI via STP "abono" notification: { id, monto, nombreOrdenante, conceptoPago, claveRastreo, fechaOperacion }. */
export class SpeiVerifier extends RailVerifier {
  readonly rail = 'SPEI'; protected secretEnv = 'SPEI_WEBHOOK_SECRET';
  parseWebhook(raw: string): IncomingPayment {
    const a = JSON.parse(raw);
    return { providerRef: String(a.claveRastreo ?? a.id), rail: this.rail, fiat: 'MXN', amount: amountMinor(a.monto, 'MXN'), reference: `${a.conceptoPago ?? ''} ${a.referenciaNumerica ?? ''}`, payerName: a.nombreOrdenante ?? '', receivedAt: new Date(a.fechaOperacion ?? Date.now()) };
  }
}
/** SBP (Russia) via a bank's incoming-payment webhook: { operationId, amount, purpose, payerName, operationDate }. */
export class SbpVerifier extends RailVerifier {
  readonly rail = 'SBP'; protected secretEnv = 'SBP_WEBHOOK_SECRET';
  parseWebhook(raw: string): IncomingPayment {
    const p = JSON.parse(raw);
    return { providerRef: p.operationId, rail: this.rail, fiat: 'RUB', amount: amountMinor(p.amount, 'RUB'), reference: p.purpose ?? '', payerName: p.payerName ?? '', receivedAt: new Date(p.operationDate ?? Date.now()) };
  }
}
/** M-Pesa Daraja C2B confirmation: { TransID, TransAmount, BillRefNumber, FirstName, MiddleName, LastName, TransTime }. */
export class MpesaVerifier extends RailVerifier {
  readonly rail = 'MPESA'; protected secretEnv = 'MPESA_WEBHOOK_SECRET';
  parseWebhook(raw: string): IncomingPayment {
    const c = JSON.parse(raw);
    const t = String(c.TransTime ?? '');
    const at = t.length === 14 ? new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}+03:00`) : new Date();
    return { providerRef: c.TransID, rail: this.rail, fiat: c.Currency ?? 'KES', amount: amountMinor(String(c.TransAmount), c.Currency ?? 'KES'), reference: c.BillRefNumber ?? '', payerName: [c.FirstName, c.MiddleName, c.LastName].filter(Boolean).join(' '), receivedAt: at };
  }
}
/** PromptPay via a Thai bank payment-confirmation callback: { transactionId, amount, billPaymentRef1, payerName, transactionDateandTime }. */
export class PromptPayVerifier extends RailVerifier {
  readonly rail = 'PROMPTPAY'; protected secretEnv = 'PROMPTPAY_WEBHOOK_SECRET';
  parseWebhook(raw: string): IncomingPayment {
    const p = JSON.parse(raw);
    return { providerRef: p.transactionId, rail: this.rail, fiat: 'THB', amount: amountMinor(p.amount, 'THB'), reference: `${p.billPaymentRef1 ?? ''} ${p.billPaymentRef2 ?? ''}`, payerName: p.payerName ?? '', receivedAt: new Date(p.transactionDateandTime ?? Date.now()) };
  }
}
