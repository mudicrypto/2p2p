import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, smallint, boolean, timestamp, jsonb, bigserial, bigint, customType,
  uniqueIndex, index, primaryKey, check,
} from 'drizzle-orm/pg-core';

/** NUMERIC(78,0) <-> bigint. Covers BIGINT-range assets and ETH wei (spec 0.1). Never a float. */
export const amount = customType<{ data: bigint; driverData: string }>({
  dataType: () => 'numeric(78,0)',
  toDriver: (v) => v.toString(),
  fromDriver: (v) => BigInt(v),
});
/** Encrypted blob (envelope-encrypted JSON/text, base64 serialized). */
const enc = (name: string) => text(name);
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();

// ---------------------------------------------------------------- identity
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  emailVerifiedAt: ts('email_verified_at'),
  phone: text('phone'),
  phoneVerifiedAt: ts('phone_verified_at'),
  tgId: text('tg_id'),
  passwordHash: text('password_hash'),
  passwordChangedAt: ts('password_changed_at'),
  totpSecretEnc: enc('totp_secret_enc'),
  totpEnabledAt: ts('totp_enabled_at'),
  securityChangedAt: ts('security_changed_at'),
  kycTier: smallint('kyc_tier').notNull().default(0),
  status: text('status').notNull().default('active'), // active | frozen | banned
  country: text('country').notNull(),
  locale: text('locale').notNull().default('en'),
  displayName: text('display_name'),
  isMerchant: boolean('is_merchant').notNull().default(false),
  sanctionsHit: boolean('sanctions_hit').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
  uniqueIndex('users_phone_uq').on(t.phone),
  uniqueIndex('users_tg_uq').on(t.tgId),
  check('users_status_ck', sql`${t.status} in ('active','frozen','banned')`),
  check('users_tier_ck', sql`${t.kycTier} between 0 and 3`),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  deviceId: uuid('device_id'),
  mfaAt: ts('mfa_at'),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]);

export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  purpose: text('purpose').notNull(), // email_verify | phone_otp | password_reset | login_otp
  target: text('target').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  createdAt: createdAt(),
}, (t) => [index('vt_target_idx').on(t.purpose, t.target)]);

export const webauthnCredentials = pgTable('webauthn_credentials', {
  id: text('id').primaryKey(), // base64url credential id
  userId: uuid('user_id').references(() => users.id),
  adminId: uuid('admin_id'),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  transports: jsonb('transports').$type<string[]>(),
  createdAt: createdAt(),
});

export const webauthnChallenges = pgTable('webauthn_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  subject: text('subject').notNull(),
  challenge: text('challenge').notNull(),
  expiresAt: ts('expires_at').notNull(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  fingerprint: text('fingerprint').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  firstSeen: ts('first_seen').notNull().defaultNow(),
  lastSeen: ts('last_seen').notNull().defaultNow(),
}, (t) => [uniqueIndex('devices_user_fp_uq').on(t.userId, t.fingerprint), index('devices_fp_idx').on(t.fingerprint), index('devices_ip_idx').on(t.ip)]);

export const loginEvents = pgTable('login_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  ip: text('ip'),
  fingerprint: text('fingerprint'),
  success: boolean('success').notNull(),
  createdAt: createdAt(),
}, (t) => [index('login_events_ip_idx').on(t.ip, t.createdAt)]);

// ---------------------------------------------------------------- admin
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  roles: jsonb('roles').$type<string[]>().notNull(), // support | arbiter | compliance | finance | superadmin
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});
export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => adminUsers.id),
  tokenHash: text('token_hash').notNull().unique(),
  webauthnAt: ts('webauthn_at'),
  ip: text('ip'),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- KYC & config
export const kycApplications = pgTable('kyc_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  level: smallint('level').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | manual_review
  verifiedFullNameEnc: enc('verified_full_name_enc'),
  dobEnc: enc('dob_enc'),
  country: text('country'),
  rejectReason: text('reject_reason'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: ts('reviewed_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('kyc_provider_ref_uq').on(t.provider, t.providerRef), index('kyc_user_idx').on(t.userId)]);

export const limitsConfig = pgTable('limits_config', {
  tier: smallint('tier').notNull(),
  asset: text('asset').notNull(), // 'USD' = USD-equivalent row
  dailyLimit: amount('daily_limit').notNull(),
  monthlyLimit: amount('monthly_limit').notNull(),
  perOrderMax: amount('per_order_max').notNull(),
  withdrawDaily: amount('withdraw_daily').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tier, t.asset] })]);

export const limitUsage = pgTable('limit_usage', {
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), // trade | withdraw
  period: text('period').notNull(), // d:2026-11-05 | m:2026-11
  used: amount('used').notNull().default(sql`0`), // USD cents
}, (t) => [primaryKey({ columns: [t.userId, t.kind, t.period] })]);

export const countryRules = pgTable('country_rules', {
  country: text('country').primaryKey(),
  status: text('status').notNull().default('allowed'), // allowed | blocked
  tier0Allowed: boolean('tier0_allowed').notNull().default(true),
  tierOverrides: jsonb('tier_overrides').$type<Record<string, unknown>>().notNull().default({}),
  limitMultiplierBps: integer('limit_multiplier_bps').notNull().default(10000),
  allowedPaymentMethods: jsonb('allowed_payment_methods').$type<string[] | null>(),
  requiredDisclosures: jsonb('required_disclosures').$type<string[]>().notNull().default([]),
  launchEnabled: boolean('launch_enabled').notNull().default(true), // feature flag per country (M16)
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const fiatCurrencies = pgTable('fiat_currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  minorUnits: smallint('minor_units').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  minOrder: amount('min_order'),
  maxOrder: amount('max_order'),
  rateSource: text('rate_source').notNull().default('median'),
});

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const rates = pgTable('rates', {
  asset: text('asset').notNull(),
  fiat: text('fiat').notNull(),
  price: amount('price').notNull(), // scaled (see shared PRICE_SCALE)
  sources: jsonb('sources').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.asset, t.fiat] })]);

// ---------------------------------------------------------------- ledger
export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  ownerType: text('owner_type').notNull(), // user | system
  ownerId: text('owner_id').notNull(), // user uuid or system name
  asset: text('asset').notNull(),
  kind: text('kind').notNull(), // available | escrow | fee | custody | insurance | hold | deposit_pending
  createdAt: createdAt(),
}, (t) => [uniqueIndex('accounts_owner_uq').on(t.ownerType, t.ownerId, t.asset, t.kind)]);

export const ledgerTx = pgTable('ledger_tx', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  type: text('type').notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ledger_tx_idem_uq').on(t.idempotencyKey), index('ledger_tx_ref_idx').on(t.refType, t.refId)]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  txId: bigint('tx_id', { mode: 'bigint' }).notNull().references(() => ledgerTx.id),
  accountId: bigint('account_id', { mode: 'bigint' }).notNull().references(() => accounts.id),
  asset: text('asset').notNull(),
  amount: amount('amount').notNull(),
}, (t) => [index('ledger_entries_account_idx').on(t.accountId), index('ledger_entries_tx_idx').on(t.txId), check('ledger_entries_nonzero', sql`${t.amount} <> 0`)]);

// ---------------------------------------------------------------- payments
export const paymentMethodTypes = pgTable('payment_method_types', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  countries: jsonb('countries').$type<string[]>().notNull(),
  currencies: jsonb('currencies').$type<string[]>().notNull(),
  fieldsSchema: jsonb('fields_schema').notNull(), // JSON describing zod object
  reversible: boolean('reversible').notNull().default(false),
  riskLevel: text('risk_level').notNull().default('low'), // low | medium | high
  verifierAvailable: boolean('verifier_available').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  optIn: boolean('opt_in').notNull().default(false),
  holdHours: integer('hold_hours').notNull().default(0),
});

export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull().references(() => paymentMethodTypes.code),
  detailsEnc: enc('details_enc').notNull(),
  holderName: text('holder_name').notNull(),
  verified: boolean('verified').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('pm_user_idx').on(t.userId)]);

// ---------------------------------------------------------------- trading
export const ads = pgTable('ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  side: text('side').notNull(), // maker side: sell = maker sells crypto
  asset: text('asset').notNull(),
  fiat: text('fiat').notNull(),
  priceType: text('price_type').notNull(),
  price: amount('price'), // scaled; for floating, last computed
  marginBps: integer('margin_bps'),
  minAmount: amount('min_amount').notNull(), // fiat minor
  maxAmount: amount('max_amount').notNull(), // fiat minor
  totalAmount: amount('total_amount').notNull(), // crypto minor
  remainingAmount: amount('remaining_amount').notNull(),
  paymentMethodIds: jsonb('payment_method_ids').$type<string[]>().notNull(),
  paymentTypes: jsonb('payment_types').$type<string[]>().notNull().default([]),
  paymentWindowMin: integer('payment_window_min').notNull().default(15),
  terms: text('terms').notNull().default(''),
  minCounterpartyTier: smallint('min_counterparty_tier').notNull().default(0),
  status: text('status').notNull().default('active'), // active | paused | closed
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  index('ads_book_idx').on(t.asset, t.fiat, t.side, t.status, t.price),
  check('ads_remaining_ck', sql`${t.remainingAmount} >= 0`),
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adId: uuid('ad_id').notNull().references(() => ads.id),
  makerId: uuid('maker_id').notNull().references(() => users.id),
  takerId: uuid('taker_id').notNull().references(() => users.id),
  buyerId: uuid('buyer_id').notNull().references(() => users.id),
  sellerId: uuid('seller_id').notNull().references(() => users.id),
  asset: text('asset').notNull(),
  fiat: text('fiat').notNull(),
  cryptoAmount: amount('crypto_amount').notNull(),
  fiatAmount: amount('fiat_amount').notNull(),
  price: amount('price').notNull(),
  feeAmount: amount('fee_amount').notNull().default(sql`0`),
  feePayer: text('fee_payer').notNull().default('seller'), // seller | buyer
  usdValueCents: amount('usd_value_cents').notNull().default(sql`0`),
  paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id),
  paymentType: text('payment_type'),
  referenceCode: text('reference_code').notNull(),
  status: text('status').notNull(),
  riskScore: integer('risk_score').notNull().default(0),
  manualConfirmRequired: boolean('manual_confirm_required').notNull().default(false),
  holdUntil: ts('hold_until'),
  paidAt: ts('paid_at'),
  releasedAt: ts('released_at'),
  cancelledAt: ts('cancelled_at'),
  expiresAt: ts('expires_at').notNull(),
  autoConfirmed: boolean('auto_confirmed').notNull().default(false),
  corridorId: uuid('corridor_id'),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('orders_ref_uq').on(t.referenceCode),
  index('orders_status_exp_idx').on(t.status, t.expiresAt),
  index('orders_buyer_idx').on(t.buyerId),
  index('orders_seller_idx').on(t.sellerId),
  index('orders_corridor_idx').on(t.corridorId),
]);

export const orderEvents = pgTable('order_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  event: text('event').notNull(),
  actor: text('actor').notNull(),
  actorId: text('actor_id'),
  reason: text('reason'),
  createdAt: createdAt(),
}, (t) => [index('order_events_order_idx').on(t.orderId)]);

export const corridors = pgTable('corridors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  fromFiat: text('from_fiat').notNull(),
  toFiat: text('to_fiat').notNull(),
  asset: text('asset').notNull(),
  buyOrderId: uuid('buy_order_id'),
  sellOrderId: uuid('sell_order_id'),
  fiatIn: amount('fiat_in').notNull(),
  fiatOut: amount('fiat_out').notNull(),
  effectiveRate: amount('effective_rate').notNull(),
  marketRate: amount('market_rate').notNull(),
  status: text('status').notNull().default('active'), // active | completed | rolled_back
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

export const chatMessages = pgTable('chat_messages', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  senderId: uuid('sender_id'),
  body: text('body').notNull().default(''),
  attachmentKey: text('attachment_key'),
  attachmentStatus: text('attachment_status'), // pending_scan | clean | infected
  flagged: boolean('flagged').notNull().default(false),
  system: boolean('system').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('chat_order_idx').on(t.orderId, t.id)]);

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  openedBy: uuid('opened_by'),
  reason: text('reason').notNull(),
  note: text('note'),
  status: text('status').notNull().default('open'), // open | in_review | escalated | resolved
  assignedArbiterId: uuid('assigned_arbiter_id'),
  decision: text('decision'), // release | refund | split
  splitBuyerBps: integer('split_buyer_bps'),
  decisionNote: text('decision_note'),
  loserId: uuid('loser_id'),
  aiSummary: text('ai_summary'),
  aiRecommendation: text('ai_recommendation'),
  aiConfidence: integer('ai_confidence'),
  slaDueAt: ts('sla_due_at').notNull(),
  escalatedAt: ts('escalated_at'),
  resolvedAt: ts('resolved_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('disputes_order_open_uq').on(t.orderId), index('disputes_status_idx').on(t.status, t.slaDueAt)]);

export const disputeEvidence = pgTable('dispute_evidence', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id),
  userId: uuid('user_id'),
  fileKey: text('file_key').notNull(),
  note: text('note'),
  createdAt: createdAt(),
});

export const reputation = pgTable('reputation', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  trades30d: integer('trades_30d').notNull().default(0),
  tradesTotal: integer('trades_total').notNull().default(0),
  completionRateBps: integer('completion_rate_bps').notNull().default(10000),
  avgReleaseSec: integer('avg_release_sec').notNull().default(0),
  disputeRateBps: integer('dispute_rate_bps').notNull().default(0),
  disputesLost: integer('disputes_lost').notNull().default(0),
  freezeReports: integer('freeze_reports').notNull().default(0),
  positiveFeedback: integer('positive_feedback').notNull().default(0),
  negativeFeedback: integer('negative_feedback').notNull().default(0),
  volume30dUsdCents: amount('volume_30d_usd_cents').notNull().default(sql`0`),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const feedback = pgTable('feedback', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  fromUser: uuid('from_user').notNull(),
  toUser: uuid('to_user').notNull(),
  positive: boolean('positive').notNull(),
  comment: text('comment'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('feedback_order_from_uq').on(t.orderId, t.fromUser)]);

export const merchantProfiles = pgTable('merchant_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  status: text('status').notNull().default('applied'), // applied | approved | rejected | suspended
  depositAmount: amount('deposit_amount').notNull().default(sql`0`),
  depositAsset: text('deposit_asset').notNull().default('USDT'),
  level: smallint('level').notNull().default(0),
  verifiedBadge: boolean('verified_badge').notNull().default(false),
  application: jsonb('application'),
  createdAt: createdAt(),
});

export const merchantApiKeys = pgTable('merchant_api_keys', {
  id: text('id').primaryKey(), // public key id
  userId: uuid('user_id').notNull().references(() => users.id),
  secretEnc: enc('secret_enc').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  revokedAt: ts('revoked_at'),
  lastUsedAt: ts('last_used_at'),
  createdAt: createdAt(),
});

export const freezeReports = pgTable('freeze_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  bankLetterKey: text('bank_letter_key').notNull(),
  claimedAmountFiat: amount('claimed_amount_fiat').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | paid
  payoutAsset: text('payout_asset'),
  payoutAmount: amount('payout_amount'),
  reviewedBy: uuid('reviewed_by'),
  reviewNote: text('review_note'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('freeze_reports_order_reporter_uq').on(t.orderId, t.reporterId)]);

// ---------------------------------------------------------------- wallet
export const depositAddresses = pgTable('deposit_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  address: text('address').notNull(),
  memo: text('memo'),
  custodyRef: text('custody_ref'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('deposit_addr_user_uq').on(t.userId, t.asset, t.network), uniqueIndex('deposit_addr_uq').on(t.network, t.address, t.memo)]);

export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  txHash: text('tx_hash').notNull(),
  fromAddress: text('from_address'),
  amount: amount('amount').notNull(),
  confirmations: integer('confirmations').notNull().default(0),
  riskScore: integer('risk_score'),
  status: text('status').notNull().default('pending'), // pending | held | credited | rejected
  createdAt: createdAt(),
  creditedAt: ts('credited_at'),
}, (t) => [uniqueIndex('deposits_tx_uq').on(t.network, t.txHash)]);

export const addressAllowlist = pgTable('address_allowlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  address: text('address').notNull(),
  label: text('label'),
  activeAt: ts('active_at').notNull(), // 24h after add
  riskScore: integer('risk_score'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('allowlist_uq').on(t.userId, t.network, t.address)]);

export const withdrawals = pgTable('withdrawals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  address: text('address').notNull(),
  amount: amount('amount').notNull(),
  fee: amount('fee').notNull().default(sql`0`),
  usdValueCents: amount('usd_value_cents').notNull().default(sql`0`),
  status: text('status').notNull(), // pending_approval | approved | submitted | completed | rejected | failed
  riskScore: integer('risk_score'),
  requiredApprovals: smallint('required_approvals').notNull().default(0),
  custodyRef: text('custody_ref'),
  txHash: text('tx_hash'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('withdrawals_status_idx').on(t.status)]);

export const withdrawalApprovals = pgTable('withdrawal_approvals', {
  withdrawalId: uuid('withdrawal_id').notNull().references(() => withdrawals.id),
  adminId: uuid('admin_id').notNull().references(() => adminUsers.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.withdrawalId, t.adminId] })]);

// ---------------------------------------------------------------- risk / notifications / infra
export const riskFlags = pgTable('risk_flags', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  subjectType: text('subject_type').notNull(), // user | order | device | withdrawal | deposit
  subjectId: text('subject_id').notNull(),
  code: text('code').notNull(),
  severity: text('severity').notNull(), // low | medium | high
  details: jsonb('details'),
  resolvedAt: ts('resolved_at'),
  createdAt: createdAt(),
}, (t) => [index('risk_flags_subject_idx').on(t.subjectType, t.subjectId), index('risk_flags_code_idx').on(t.code)]);

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  readAt: ts('read_at'),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.id)]);

export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(),
  createdAt: createdAt(),
});

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').notNull(),
  scope: text('scope').notNull(), // user id / webhook source
  requestHash: text('request_hash').notNull(),
  status: text('status').notNull().default('in_progress'), // in_progress | done
  responseCode: integer('response_code'),
  responseBody: jsonb('response_body'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.scope, t.key] })]);

export const paymentConfirmations = pgTable('payment_confirmations', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  amountMatch: boolean('amount_match').notNull(),
  referenceMatch: boolean('reference_match').notNull(),
  nameMatch: boolean('name_match').notNull(),
  payerNameEnc: enc('payer_name_enc'),
  raw: jsonb('raw'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('payconf_provider_ref_uq').on(t.provider, t.providerRef)]);

export const reports = pgTable('compliance_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(), // SAR | STR
  subjectUserId: uuid('subject_user_id'),
  createdBy: uuid('created_by').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: createdAt(),
});

/** Append-only. UPDATE/DELETE are blocked by a trigger (see migrations/0001_audit_append_only.sql). */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  actorType: text('actor_type').notNull(), // user | admin | system
  actorId: text('actor_id'),
  action: text('action').notNull(),
  subjectType: text('subject_type'),
  subjectId: text('subject_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_subject_idx').on(t.subjectType, t.subjectId), index('audit_action_idx').on(t.action, t.createdAt)]);
