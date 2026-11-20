/**
 * Deterministic in-process mocks for every provider. They make the whole platform work
 * end-to-end without accounts. Tests drive them via the `simulate*` helpers.
 */
import { createHmac, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import type { Asset, Network } from '@p2p/shared';
import { PRICE_SCALE } from '@p2p/shared';
import type {
  CustodyProvider, CustodyDepositEvent, CustodyWithdrawalResult, DepositAddress,
  KycProvider, KycResult, KycSession, KycLevel,
  ChainRiskProvider, RiskScreenResult,
  PaymentVerifier, PaymentCheckRequest, IncomingPayment,
  Notifier, NotifyMessage, RateSource, RateQuote, StorageProvider, VirusScanner,
  AiTriageProvider, TriageInput, TriageOutput,
} from '../interfaces';

const MOCK_SECRET = () => {
  const s = process.env.MOCK_WEBHOOK_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'mock-webhook-secret');
  if (!s) throw new Error('MOCK_WEBHOOK_SECRET must be set to use mock webhooks in production');
  return s;
};
export function mockSign(body: string): string {
  return createHmac('sha256', MOCK_SECRET()).update(body).digest('hex');
}
function verifySig(body: string, sig?: string): boolean {
  if (!sig) return false;
  if (process.env.NODE_ENV === 'production' && !process.env.MOCK_WEBHOOK_SECRET) return false;
  const a = Buffer.from(mockSign(body));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ custody
export class MockCustody implements CustodyProvider {
  readonly name = 'mock-custody';
  private balances = new Map<Asset, bigint>();
  private wds = new Map<string, CustodyWithdrawalResult>();
  /** Withdrawal outcome for the next submissions (tests can force failures). */
  nextWithdrawalStatus: 'submitted' | 'completed' | 'failed' = 'completed';

  async createDepositAddress(userId: string, asset: Asset, network: Network): Promise<DepositAddress> {
    const h = createHash('sha256').update(`${userId}:${asset}:${network}`).digest('hex');
    const prefix: Record<string, string> = { TRON: 'T', TON: 'UQ', BITCOIN: 'tb1q', ETHEREUM: '0x', BSC: '0x', POLYGON: '0x' };
    const len = network === 'BITCOIN' ? 38 : network === 'TRON' ? 33 : 40;
    return { address: (prefix[network] ?? 'x') + h.slice(0, len), custodyRef: `mock-vault-${h.slice(0, 12)}`, memo: network === 'TON' ? h.slice(0, 8) : undefined };
  }
  async submitWithdrawal(req: { withdrawalId: string; asset: Asset; network: Network; address: string; amount: bigint }): Promise<CustodyWithdrawalResult> {
    const bal = this.balances.get(req.asset) ?? 0n;
    const ref = `mock-wd-${req.withdrawalId}`;
    const existing = this.wds.get(ref);
    if (existing) return existing; // idempotent on withdrawalId
    let status = this.nextWithdrawalStatus;
    if (bal < req.amount) status = 'failed';
    const res: CustodyWithdrawalResult = { custodyRef: ref, status, txHash: status === 'failed' ? undefined : '0x' + createHash('sha256').update(ref).digest('hex') };
    if (status !== 'failed') this.balances.set(req.asset, bal - req.amount);
    this.wds.set(ref, res);
    return res;
  }
  async getWithdrawal(ref: string) {
    return this.wds.get(ref) ?? { custodyRef: ref, status: 'failed' as const };
  }
  async getBalance(asset: Asset) {
    return this.balances.get(asset) ?? 0n;
  }
  verifyWebhook(body: string, headers: Record<string, string | undefined>) {
    return verifySig(body, headers['x-mock-signature']);
  }
  parseWebhook(body: string): CustodyDepositEvent | null {
    const j = JSON.parse(body);
    if (j.type !== 'deposit') return null;
    return { ...j.data, amount: BigInt(j.data.amount) };
  }
  /** Build a signed deposit webhook and credit the mock on-chain balance (once per tx). */
  simulateDeposit(ev: Omit<CustodyDepositEvent, 'eventId'> & { eventId?: string }) {
    const key = `seen:${ev.network}:${ev.txHash}`;
    if (!this.wds.has(key)) {
      this.balances.set(ev.asset, (this.balances.get(ev.asset) ?? 0n) + ev.amount);
      this.wds.set(key, { custodyRef: key, status: 'completed' });
    }
    const body = JSON.stringify({ type: 'deposit', data: { ...ev, eventId: ev.eventId ?? `${ev.txHash}:${ev.confirmations}`, amount: ev.amount.toString() } });
    return { body, headers: { 'x-mock-signature': mockSign(body) } };
  }
  /** Test hook: change the custody balance out-of-band (to exercise the invariant job). */
  setBalance(asset: Asset, v: bigint) {
    this.balances.set(asset, v);
  }
}

// ------------------------------------------------------------------ KYC
export class MockKyc implements KycProvider {
  readonly name = 'mock-kyc';
  private apps = new Map<string, KycResult>();
  async createApplicant(userId: string, level: KycLevel): Promise<KycSession> {
    const providerRef = `mock-kyc-${userId}-${level}-${randomUUID().slice(0, 8)}`;
    this.apps.set(providerRef, { eventId: providerRef, providerRef, status: 'pending', level });
    return { providerRef, accessToken: `mock-token-${providerRef}`, url: `/kyc/mock?ref=${providerRef}` };
  }
  async getResult(ref: string): Promise<KycResult> {
    const r = this.apps.get(ref);
    if (!r) throw new Error('unknown applicant');
    return r;
  }
  verifyWebhook(body: string, headers: Record<string, string | undefined>) {
    return verifySig(body, headers['x-mock-signature']);
  }
  parseWebhook(body: string): KycResult {
    return JSON.parse(body) as KycResult;
  }
  simulateReview(providerRef: string, r: Partial<KycResult> & { status: KycResult['status'] }) {
    const level = (this.apps.get(providerRef)?.level ?? (Number(providerRef.split('-').at(-2)) as KycLevel)) || 1;
    const res: KycResult = { eventId: `${providerRef}:${r.status}:${randomUUID().slice(0, 6)}`, providerRef, level, ...r };
    this.apps.set(providerRef, res);
    const body = JSON.stringify(res);
    return { body, headers: { 'x-mock-signature': mockSign(body) } };
  }
}

// ------------------------------------------------------------------ chain risk / sanctions
export class MockChainRisk implements ChainRiskProvider {
  readonly name = 'mock-chain-risk';
  sanctionedAddresses = new Set<string>();
  riskyAddresses = new Map<string, number>();
  sanctionedNames = new Set<string>(['SANCTIONED PERSON', 'JOHN SANCTION']);
  async screenAddress(_n: Network, address: string): Promise<RiskScreenResult> {
    const a = address.toLowerCase();
    if (this.sanctionedAddresses.has(a) || a.includes('dead00')) return { score: 100, sanctioned: true, categories: ['sanctions'] };
    const s = this.riskyAddresses.get(a) ?? (a.includes('beef') ? 85 : 5);
    return { score: s, sanctioned: false, categories: s > 70 ? ['mixer'] : [] };
  }
  async screenPerson(p: { fullName?: string; email?: string; country: string }) {
    const hit = (!!p.fullName && this.sanctionedNames.has(p.fullName.toUpperCase())) || !!p.email?.startsWith('sanctioned');
    return { hit, lists: hit ? ['OFAC-SDN(mock)'] : [] };
  }
}

// ------------------------------------------------------------------ payment verifier
/** One mock verifier per rail; tests inject incoming payments into a shared inbox. */
export class MockPaymentInbox {
  private payments: IncomingPayment[] = [];
  push(p: Omit<IncomingPayment, 'providerRef' | 'receivedAt'> & { providerRef?: string }) {
    const full = { providerRef: p.providerRef ?? `mock-pay-${randomUUID()}`, receivedAt: new Date(), ...p };
    this.payments.push(full);
    return full;
  }
  find(rail: string, reference: string) {
    return this.payments.find((p) => p.rail === rail && p.reference.includes(reference)) ?? null;
  }
}
export class MockPaymentVerifier implements PaymentVerifier {
  constructor(readonly rail: string, private inbox: MockPaymentInbox) {}
  async findPayment(req: PaymentCheckRequest) {
    return this.inbox.find(this.rail, req.referenceCode);
  }
  verifyWebhook(body: string, headers: Record<string, string | undefined>) {
    return verifySig(body, headers['x-mock-signature']);
  }
  parseWebhook(body: string): IncomingPayment {
    const j = JSON.parse(body);
    return { ...j, amount: BigInt(j.amount), receivedAt: new Date(j.receivedAt ?? Date.now()) };
  }
}

// ------------------------------------------------------------------ notifier
export class MockNotifier implements Notifier {
  readonly outbox: NotifyMessage[] = [];
  async send(msg: NotifyMessage) {
    this.outbox.push(msg);
    if (process.env.MOCK_NOTIFIER_LOG === '1') console.log(`[notify:${msg.channel}] ${msg.template} -> ${redact(msg.to)}`);
    return { id: `mock-${this.outbox.length}` };
  }
  last(template?: string) {
    return [...this.outbox].reverse().find((m) => !template || m.template === template);
  }
}
const redact = (s: string) => (s.length <= 4 ? '****' : s.slice(0, 2) + '***' + s.slice(-2));

// ------------------------------------------------------------------ rates
/** Mock reference prices (fiat major units per asset) — deterministic, per source jitter in bps. */
const BASE_USD: Record<Asset, number> = { USDT: 1, BTC: 68_000, ETH: 3_400 };
const FX_PER_USD: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, RUB: 92.5, BRL: 5.4, INR: 83.2, NGN: 1500, TRY: 32.5, ARS: 900, MXN: 17.1, KES: 129, PHP: 56.5, IDR: 15900, VND: 25400, UAH: 41.2, KZT: 470, JPY: 151, KRW: 1350 };
export class MockRateSource implements RateSource {
  constructor(readonly name: string, private jitterBps = 0, private down = false) {}
  async fetch(asset: Asset, fiat: string): Promise<RateQuote | null> {
    if (this.down) return null;
    const fx = FX_PER_USD[fiat] ?? 1;
    // Use integer math: price in fiat major * 10^4 then scale.
    const major4 = BigInt(Math.round(BASE_USD[asset] * fx * 10_000 * (1 + this.jitterBps / 10_000)));
    const fiatDecimals = ['JPY', 'KRW', 'VND', 'IDR'].includes(fiat) ? 0 : 2;
    const price = (major4 * 10n ** BigInt(fiatDecimals) * PRICE_SCALE) / 10_000n;
    return { source: this.name, asset, fiat, price, at: new Date() };
  }
}

// ------------------------------------------------------------------ storage / scanning
export class MemoryStorage implements StorageProvider {
  private objects = new Map<string, { body: Buffer; contentType: string }>();
  async presignUpload(key: string) {
    return { url: `/v1/dev/storage/${encodeURIComponent(key)}` };
  }
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
  async presignDownload(key: string) {
    return `/v1/dev/storage/${encodeURIComponent(key)}`;
  }
}
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
export class MockVirusScanner implements VirusScanner {
  async scan(body: Buffer) {
    return body.toString('latin1').includes(EICAR) ? { clean: false, signature: 'EICAR-Test' } : { clean: true };
  }
}

// ------------------------------------------------------------------ AI triage
export class HeuristicTriage implements AiTriageProvider {
  async triage(input: TriageInput): Promise<TriageOutput> {
    const v = input.verifierData as Array<{ amountMatch?: boolean; nameMatch?: boolean; referenceMatch?: boolean }>;
    const full = v.find((x) => x.amountMatch && x.referenceMatch);
    const chatText = input.chat.map((c) => c.body.toLowerCase()).join(' ');
    let rec: TriageOutput['recommendation'] = 'unclear';
    let confidence = 30;
    let rationale = 'Insufficient automated evidence.';
    if (full && full.nameMatch) { rec = 'release'; confidence = 85; rationale = 'Verifier shows a matching payment from the KYC-named buyer.'; }
    else if (full && !full.nameMatch) { rec = 'refund'; confidence = 60; rationale = 'Payment received from a third party; return funds and refund escrow.'; }
    else if (/never (paid|sent)|didn't pay|no payment/.test(chatText)) { rec = 'refund'; confidence = 45; rationale = 'Chat suggests no payment was made and verifier has no record.'; }
    const summary = `Order ${String(input.orderSummary.id ?? '')}: ${input.chat.length} chat messages, ${input.evidenceNotes.length} evidence items, ${v.length} verifier records.`;
    return { summary, recommendation: rec, confidence, rationale };
  }
}

export interface MockBundle {
  custody: MockCustody; kyc: MockKyc; chainRisk: MockChainRisk; paymentInbox: MockPaymentInbox;
  notifier: MockNotifier; storage: MemoryStorage; scanner: MockVirusScanner; triage: HeuristicTriage;
  rateSources: RateSource[]; verifiers: Map<string, PaymentVerifier>;
}
