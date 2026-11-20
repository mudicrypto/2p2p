import { systemConfig, eq, type DbOrTx } from '@p2p/db';
import { DomainError } from '@p2p/shared';

/** Runtime configuration stored in system_config (admin editable, no deploy). Defaults below. */
export const CONFIG_DEFAULTS = {
  fees: { makerBps: 10, takerBps: 0, insuranceShareBps: 1000, merchantLevelMakerBps: { 1: 8, 2: 6, 3: 4 } as Record<string, number> },
  trading: { appealWaitMin: 10, defaultPaymentWindowMin: 15, maxOpenOrdersPerUser: 10, reversibleHoldHours: 72 },
  confirmations: { TRON: 20, TON: 10, BSC: 15, ETHEREUM: 12, POLYGON: 128, BITCOIN: 2 } as Record<string, number>,
  withdrawals: { paused: false, auditGate: true, manualApprovalUsdCents: 1_000_000, newAddressDelayHours: 24, requiredApprovals: 2, networkFee: { USDT: '1', BTC: '0.0001', ETH: '0.001' } as Record<string, string> },
  // newAccountLimitBps 10000 = new accounts get full limits; set lower (e.g. 2500) to cap young accounts.
  cooldowns: { newAccountHours: 48, newAccountLimitBps: 10000, securityChangeWithdrawHours: 24 },
  risk: { manualConfirmScore: 70, depositHoldScore: 70, withdrawBlockScore: 90, velocityOrdersPerHour: 10, maxAccountsPerDevice: 2 },
  disputes: { slaMin: 30, escalateAfterMin: 30, autoFreezeLostDisputes: 3 },
  insurance: { maxPayoutUsdCents: 500_000 },
  // Accounts with an email must confirm it before posting ads, placing orders or withdrawing (Telegram-only accounts have no email).
  accounts: { requireVerifiedEmail: true },
  // Invite rewards: paid to the inviter from the rewards fund (admins top it up from fees) after the invitee's first qualifying trade.
  referral: { enabled: true, rewardAsset: 'USDT', rewardAmount: '5', minTradeUsdCents: 2_000 },
  // Reminders to a seller who hasn't released after the buyer marked the order paid.
  releaseReminders: { afterMin: [10, 30] as number[] },
  // Paid ad promotion: price per day (charged in USDT to the platform fee account), how many promoted slots show per market.
  promotion: { pricePerDayUsdt: '2', maxDays: 30, slots: 2 },
  merchants: { minDepositUsdCents: 500_000, levels: [{ level: 1, volume30dUsdCents: 0 }, { level: 2, volume30dUsdCents: 10_000_000 }, { level: 3, volume30dUsdCents: 100_000_000 }] as Array<{ level: number; volume30dUsdCents: number }> },
};
export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
export type ConfigOf<K extends ConfigKey> = (typeof CONFIG_DEFAULTS)[K];

const cache = new Map<string, { at: number; v: unknown }>();
const TTL_MS = Number(process.env.CONFIG_CACHE_MS ?? 2000);

export async function getConfig<K extends ConfigKey>(db: DbOrTx, key: K): Promise<ConfigOf<K>> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.v as ConfigOf<K>;
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  const v = { ...CONFIG_DEFAULTS[key], ...((row?.value as object) ?? {}) } as ConfigOf<K>;
  cache.set(key, { at: Date.now(), v });
  return v;
}
export async function setConfig<K extends ConfigKey>(db: DbOrTx, key: K, value: Partial<ConfigOf<K>>) {
  const cur = await getConfig(db, key);
  const merged = { ...cur, ...value };
  await db.insert(systemConfig).values({ key, value: merged }).onConflictDoUpdate({ target: systemConfig.key, set: { value: merged, updatedAt: new Date() } });
  cache.delete(key);
  return merged;
}
export function clearConfigCache() { cache.clear(); }

/** Throws EMAIL_UNVERIFIED for an account whose email isn't confirmed yet (when the rule is on). */
export async function assertEmailVerified(db: DbOrTx, user: { email: string | null; emailVerifiedAt: Date | null }) {
  if (!user.email || user.emailVerifiedAt) return;
  if (!(await getConfig(db, 'accounts')).requireVerifiedEmail) return;
  throw new DomainError('EMAIL_UNVERIFIED', 'confirm your email first');
}
