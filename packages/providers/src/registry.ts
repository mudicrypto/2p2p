import type { AiTriageProvider, ChainRiskProvider, CustodyProvider, KycProvider, Notifier, PaymentVerifier, RateSource, StorageProvider, VirusScanner } from './interfaces';
import { HeuristicTriage, MemoryStorage, MockChainRisk, MockCustody, MockKyc, MockNotifier, MockPaymentInbox, MockPaymentVerifier, MockRateSource, MockVirusScanner } from './mock';
import { ChannelNotifier, PostmarkNotifier, TelegramNotifier, TwilioNotifier, ExpoPushNotifier } from './real/notifiers';
import { SumsubKyc } from './real/sumsub';
import { ClaudeTriage } from './real/triage';
import { BinanceRateSource, CoinbaseRateSource, FxCrossRateSource, KrakenRateSource } from './real/rates';
import { TrmChainRisk } from './real/stubs';
import { VERIFIER_RAILS, createRealVerifier } from './verifiers';

export interface Providers {
  mode: 'mock' | 'real';
  custody: CustodyProvider;
  kyc: KycProvider;
  chainRisk: ChainRiskProvider;
  personScreen: ChainRiskProvider;
  notifier: Notifier;
  rateSources: RateSource[];
  verifiers: Map<string, PaymentVerifier>;
  storage: StorageProvider;
  scanner: VirusScanner;
  triage: AiTriageProvider;
  /** Present in mock mode for tests and the dev simulation endpoints. */
  mocks?: { custody: MockCustody; kyc: MockKyc; chainRisk: MockChainRisk; paymentInbox: MockPaymentInbox; notifier: MockNotifier };
}

const has = (...k: string[]) => k.every((x) => !!process.env[x]);

/**
 * Build providers. Each provider independently uses the real adapter only when its keys exist
 * (and PROVIDER_MODE=real); otherwise the mock. A missing key never blocks development.
 */
export function createProviders(mode: 'mock' | 'real' = (process.env.PROVIDER_MODE as 'mock' | 'real') ?? 'mock'): Providers {
  const custodyM = new MockCustody();
  const kycM = new MockKyc();
  const riskM = new MockChainRisk();
  const inbox = new MockPaymentInbox();
  const notifierM = new MockNotifier();
  const real = mode === 'real';

  const verifiers = new Map<string, PaymentVerifier>();
  for (const rail of VERIFIER_RAILS) verifiers.set(rail, (real && createRealVerifier(rail)) || new MockPaymentVerifier(rail, inbox));

  const notifier = real
    ? new ChannelNotifier({
        telegram: has('TELEGRAM_BOT_TOKEN') ? new TelegramNotifier() : undefined,
        email: has('POSTMARK_TOKEN') ? new PostmarkNotifier() : undefined,
        sms: has('TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM') ? new TwilioNotifier() : undefined,
        push: process.env.PUSH_MODE === 'expo' ? new ExpoPushNotifier() : undefined,
      }, notifierM)
    : notifierM;

  const rateSources: RateSource[] = real && process.env.RATES_MODE !== 'mock'
    ? [new BinanceRateSource(), new KrakenRateSource(), new CoinbaseRateSource(), new FxCrossRateSource(new CoinbaseRateSource())]
    : [new MockRateSource('mock-a', 0), new MockRateSource('mock-b', 20), new MockRateSource('mock-c', -15)];

  const providers: Providers = {
    mode,
    // TODO(provider): custody stays mocked until Fireblocks/BitGo/Cobo sandbox keys exist (see real/stubs.ts).
    custody: custodyM,
    kyc: real && has('SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY') ? new SumsubKyc() : kycM,
    chainRisk: real && has('TRM_API_KEY') ? new TrmChainRisk() : riskM,
    // TODO(provider): person-level sanctions screening vendor not chosen; mock list until then.
    personScreen: riskM,
    notifier,
    rateSources,
    verifiers,
    storage: new MemoryStorage(), // TODO(provider): S3 adapter once S3_* credentials exist
    scanner: new MockVirusScanner(), // TODO(provider): ClamAV/vendor scanner
    triage: real && has('ANTHROPIC_API_KEY') ? new ClaudeTriage() : new HeuristicTriage(),
    mocks: { custody: custodyM, kyc: kycM, chainRisk: riskM, paymentInbox: inbox, notifier: notifierM },
  };
  assertNoMocksInProduction(providers);
  return providers;
}

/**
 * Mocks accept signed webhooks with a well-known dev secret and expose simulation hooks: they must never serve
 * production traffic. Production refuses to start with any money-relevant mock unless explicitly allowed (e.g. a
 * staging cluster running NODE_ENV=production with ALLOW_MOCK_PROVIDERS=1).
 */
export function assertNoMocksInProduction(p: Providers) {
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PROVIDERS === '1') return;
  const mocked = [
    p.mode === 'mock' && 'PROVIDER_MODE=mock',
    p.custody instanceof MockCustody && 'custody',
    p.kyc instanceof MockKyc && 'kyc',
    p.chainRisk instanceof MockChainRisk && 'chainRisk',
    p.personScreen instanceof MockChainRisk && 'personScreen',
  ].filter(Boolean);
  if (mocked.length) throw new Error(`refusing to start in production with mock providers: ${mocked.join(', ')} (TODO(provider): configure real keys)`);
}
