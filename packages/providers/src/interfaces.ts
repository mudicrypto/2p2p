/** Provider adapter interfaces (spec section 2). Every real integration implements one of these. */
import type { Asset, Network } from '@p2p/shared';

// ---- Custody (Fireblocks / BitGo / Cobo). No self-managed keys.
export interface DepositAddress { address: string; memo?: string; custodyRef: string }
export interface CustodyDepositEvent {
  eventId: string; // idempotency key for the webhook
  network: Network; asset: Asset; address: string; memo?: string;
  txHash: string; fromAddress?: string; amount: bigint; confirmations: number;
}
export interface CustodyWithdrawalResult { custodyRef: string; status: 'submitted' | 'completed' | 'failed'; txHash?: string }
export interface CustodyProvider {
  readonly name: string;
  createDepositAddress(userId: string, asset: Asset, network: Network): Promise<DepositAddress>;
  submitWithdrawal(req: { withdrawalId: string; asset: Asset; network: Network; address: string; amount: bigint }): Promise<CustodyWithdrawalResult>;
  getWithdrawal(custodyRef: string): Promise<CustodyWithdrawalResult>;
  /** Total on-chain balance held in custody for an asset (all networks), minor units. */
  getBalance(asset: Asset): Promise<bigint>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseWebhook(rawBody: string): CustodyDepositEvent | null;
}

// ---- KYC (Sumsub / Onfido)
export type KycLevel = 1 | 2 | 3;
export interface KycSession { providerRef: string; accessToken: string; url?: string }
export interface KycResult {
  eventId: string;
  providerRef: string;
  status: 'approved' | 'rejected' | 'pending' | 'manual_review';
  level: KycLevel;
  fullName?: string; dob?: string; country?: string; rejectReason?: string;
}
export interface KycProvider {
  readonly name: string;
  createApplicant(userId: string, level: KycLevel): Promise<KycSession>;
  getResult(providerRef: string): Promise<KycResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseWebhook(rawBody: string): KycResult;
}

// ---- Chain risk + sanctions (TRM / Chainalysis)
export interface RiskScreenResult { score: number; /* 0-100 */ sanctioned: boolean; categories: string[] }
export interface ChainRiskProvider {
  readonly name: string;
  screenAddress(network: Network, address: string): Promise<RiskScreenResult>;
  screenPerson(p: { fullName?: string; email?: string; country: string; dob?: string }): Promise<{ hit: boolean; lists: string[] }>;
}

// ---- Payment verification (open banking / PSP per rail)
export interface PaymentCheckRequest { orderId: string; rail: string; fiat: string; amount: bigint; referenceCode: string; expectedPayerName: string; payeeDetails: Record<string, unknown> }
export interface IncomingPayment { providerRef: string; rail: string; fiat: string; amount: bigint; reference: string; payerName: string; receivedAt: Date }
export interface PaymentVerifier {
  readonly rail: string;
  /** Look for a payment matching the order; returns null if nothing has arrived. */
  findPayment(req: PaymentCheckRequest): Promise<IncomingPayment | null>;
  verifyWebhook?(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseWebhook?(rawBody: string): IncomingPayment;
}

// ---- Notifications
export type NotifyChannel = 'telegram' | 'email' | 'sms' | 'push';
export interface NotifyMessage { channel: NotifyChannel; to: string; template: string; params: Record<string, unknown>; locale?: string }
export interface Notifier { send(msg: NotifyMessage): Promise<{ id: string }> }

// ---- Rates
export interface RateQuote { source: string; asset: Asset; fiat: string; /* scaled price */ price: bigint; at: Date }
export interface RateSource { readonly name: string; fetch(asset: Asset, fiat: string): Promise<RateQuote | null> }

// ---- Object storage (S3-compatible, private)
export interface StorageProvider {
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<{ url: string; fields?: Record<string, string> }>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  presignDownload(key: string, ttlSec: number): Promise<string>;
}
export interface VirusScanner { scan(body: Buffer): Promise<{ clean: boolean; signature?: string }> }

// ---- LLM triage (disputes). Never decides; recommendation only.
export interface TriageInput { orderSummary: Record<string, unknown>; chat: Array<{ from: string; body: string; at: string }>; evidenceNotes: string[]; verifierData: unknown[] }
export interface TriageOutput { summary: string; recommendation: 'release' | 'refund' | 'split' | 'unclear'; confidence: number; rationale: string }
export interface AiTriageProvider { triage(input: TriageInput): Promise<TriageOutput> }
