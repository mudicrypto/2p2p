import { systemConfig, eq, type DbOrTx } from '@p2p/db';

/** Runtime configuration stored in system_config (admin editable, no deploy). Defaults below. */
export const CONFIG_DEFAULTS = {
  fees: { makerBps: 10, takerBps: 0, insuranceShareBps: 1000, merchantLevelMakerBps: { 1: 8, 2: 6, 3: 4 } as Record<string, number> },
  trading: { appealWaitMin: 10, defaultPaymentWindowMin: 15, maxOpenOrdersPerUser: 10, reversibleHoldHours: 72 },
  confirmations: { TRON: 20, TON: 10, BSC: 15, ETHEREUM: 12, POLYGON: 128, BITCOIN: 2 } as Record<string, number>,
  withdrawals: { paused: false, manualApprovalUsdCents: 1_000_000, newAddressDelayHours: 24, requiredApprovals: 2, networkFee: { USDT: '1', BTC: '0.0001', ETH: '0.001' } as Record<string, string> },
  cooldowns: { newAccountHours: 48, newAccountLimitBps: 2500, securityChangeWithdrawHours: 24 },
  risk: { manualConfirmScore: 70, depositHoldScore: 70, withdrawBlockScore: 90, velocityOrdersPerHour: 10, maxAccountsPerDevice: 2 },
  disputes: { slaMin: 30, escalateAfterMin: 30, autoFreezeLostDisputes: 3 },
  insurance: { maxPayoutUsdCents: 500_000 },
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
