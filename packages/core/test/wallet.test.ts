import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { adminUsers, addressAllowlist, users, withdrawals, eq } from '@p2p/db';
import { ASSETS, toMinor, type Asset, type Network } from '@p2p/shared';
import { makeCtx, mkUser, ensureSeed, refresh, uniq, sepa } from './helpers';
import {
  getDepositAddress, handleCustodyWebhook, requestWithdrawal, addAllowlistAddress, approveWithdrawal, submitWithdrawal, internalTransfer,
  createAd, createOrder, markPaid, releaseOrder, balanceOf, userAcct, checkInvariants, totpSetup, totpConfirm, setConfig, reviewHeldDeposit, type User,
} from '../src';

const ctx = makeCtx();
const custody = ctx.providers.mocks!.custody;
beforeAll(async () => {
  await ensureSeed(ctx); await setConfig(ctx.db, 'withdrawals', { paused: false, auditGate: false });
  // Other suites share this DB: start the mock custody at the current liabilities so the invariant is meaningful.
  for (const p of (await checkInvariants(ctx.db)).perAsset) custody.setBalance(p.asset as Asset, p.liabilities);
});
afterAll(() => ctx.close());

async function with2fa(u: User) {
  const { secret } = await totpSetup(ctx, u.id);
  await totpConfirm(ctx, u.id, authenticator.generate(secret));
  // 2FA enablement starts the security cooldown; age it for tests that withdraw.
  await ctx.db.update(users).set({ securityChangedAt: new Date(Date.now() - 48 * 3600_000) }).where(eq(users.id, u.id));
  return { user: await refresh(ctx, u), code: () => authenticator.generate(secret) };
}
const DEST: Record<Network, string> = {
  TRON: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', ETHEREUM: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', BSC: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  POLYGON: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', BITCOIN: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', TON: 'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
};
async function deposit(u: User, asset: Asset, network: Network, amount: bigint, confirmations: number, txHash = uniq('tx'), fromAddress?: string) {
  const a = await getDepositAddress(ctx, u, asset, network);
  const wh = custody.simulateDeposit({ network, asset, address: a.address, memo: a.memo ?? undefined, txHash, amount, confirmations, fromAddress });
  return { res: await handleCustodyWebhook(ctx, wh.body, wh.headers), wh, txHash };
}
async function allowlistNow(u: { user: User; code: () => string }, asset: Asset, network: Network) {
  const row = await addAllowlistAddress(ctx, u.user, { asset, network, address: DEST[network], totp: u.code() });
  await expect(requestWithdrawal(ctx, u.user, { asset, network, address: DEST[network], amount: '0.0001', totp: u.code() })).rejects.toMatchObject({ code: 'COOLDOWN' });
  await ctx.db.update(addressAllowlist).set({ activeAt: new Date(Date.now() - 1000) }).where(eq(addressAllowlist.id, row.id));
}

describe('M16 launch gate', () => {
  it('while the auditor gate is on, even small withdrawals need two-admin approval', async () => {
    await setConfig(ctx.db, 'withdrawals', { auditGate: true });
    const u = await mkUser(ctx, { tier: 2 });
    await deposit(u, 'USDT', 'TRON', toMinor('50', 6), 100);
    const b = await with2fa(u);
    await allowlistNow(b, 'USDT', 'TRON');
    const w = await requestWithdrawal(ctx, b.user, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '5', totp: b.code() });
    expect(w).toMatchObject({ status: 'pending_approval', requiredApprovals: 2 });
    await setConfig(ctx.db, 'withdrawals', { auditGate: false });
  });
});

describe('M5 wallet & custody', () => {
  const pairs = Object.entries(ASSETS).flatMap(([asset, a]) => a.networks.map((n) => [asset as Asset, n as Network] as const));
  for (const [asset, network] of pairs) {
    it(`deposit -> trade -> withdrawal on ${asset}/${network}`, async () => {
      const dec = ASSETS[asset].decimals;
      const amt = toMinor(asset === 'USDT' ? '1000' : asset === 'BTC' ? '0.05' : '0.5', dec);
      const seller = await mkUser(ctx, { tier: 2 });
      // Deposit below and at the confirmation threshold.
      const first = await deposit(seller, asset, network, amt, 1);
      expect(first.res.outcome).toBe('pending');
      expect(await balanceOf(ctx.db, userAcct(seller.id, asset))).toBe(0n);
      const wh2 = custody.simulateDeposit({ network, asset, address: (await getDepositAddress(ctx, seller, asset, network)).address, memo: (await getDepositAddress(ctx, seller, asset, network)).memo ?? undefined, txHash: first.txHash, amount: amt, confirmations: 200 });
      expect((await handleCustodyWebhook(ctx, wh2.body, wh2.headers)).outcome).toBe('credited');
      expect((await handleCustodyWebhook(ctx, wh2.body, wh2.headers)).outcome).toBe('credited'); // replay
      expect(await balanceOf(ctx.db, userAcct(seller.id, asset))).toBe(amt);

      // Trade half to a buyer.
      const pm = await sepa(ctx, seller);
      const price = asset === 'USDT' ? '0.95' : asset === 'BTC' ? '60000' : '3000';
      const ad = await createAd(ctx, seller, { side: 'sell', asset, fiat: 'EUR', priceType: 'fixed', price, minAmount: '10', maxAmount: '100000', totalAmount: asset === 'USDT' ? '500' : asset === 'BTC' ? '0.02' : '0.2', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
      const buyerU = await mkUser(ctx, { tier: 2 });
      const o = await createOrder(ctx, buyerU, { adId: ad.id, cryptoAmount: asset === 'USDT' ? '400' : asset === 'BTC' ? '0.01' : '0.1' });
      await markPaid(ctx, buyerU, o.id);
      await releaseOrder(ctx, seller, o.id, undefined, { skip2fa: true });
      const got = await balanceOf(ctx.db, userAcct(buyerU.id, asset));
      expect(got).toBe(o.cryptoAmount);

      // Buyer withdraws on the same network.
      const b = await with2fa(buyerU);
      await allowlistNow(b, asset, network);
      const fee = toMinor({ USDT: '1', BTC: '0.0001', ETH: '0.001' }[asset], dec);
      const w = await requestWithdrawal(ctx, b.user, { asset, network, address: DEST[network], amount: fromMinorStr(got - fee, dec), totp: b.code() });
      expect(w.status).toBe('approved');
      expect(await balanceOf(ctx.db, userAcct(buyerU.id, asset))).toBe(0n);
      expect((await submitWithdrawal(ctx, w.id)).status).toBe('completed');
      expect(await balanceOf(ctx.db, userAcct(buyerU.id, asset, 'withdraw_pending'))).toBe(0n);
      const inv = await checkInvariants(ctx.db, (a) => custody.getBalance(a as Asset));
      expect(inv.ok, JSON.stringify(inv, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(true);
    });
  }

  it('withdrawal rules: 2FA, allowlist, cooldown after security change, sanctions, tier-0 daily limit, pause', async () => {
    const u = await mkUser(ctx, { tier: 0 });
    await deposit(u, 'USDT', 'TRON', toMinor('2000', 6), 100);
    await expect(requestWithdrawal(ctx, u, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '10' })).rejects.toMatchObject({ code: 'TWO_FA_REQUIRED' });
    const { secret } = await totpSetup(ctx, u.id);
    await totpConfirm(ctx, u.id, authenticator.generate(secret));
    const fresh = await refresh(ctx, u);
    const code = () => authenticator.generate(secret);
    await expect(requestWithdrawal(ctx, fresh, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '10', totp: code() })).rejects.toMatchObject({ code: 'COOLDOWN' });
    await ctx.db.update(users).set({ securityChangedAt: new Date(Date.now() - 48 * 3600_000) }).where(eq(users.id, u.id));
    const u2 = await refresh(ctx, u);
    await expect(requestWithdrawal(ctx, u2, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '10', totp: code() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(addAllowlistAddress(ctx, u2, { asset: 'USDT', network: 'TRON', address: 'Tdead00SanctionedAddressxxxxxxxxxx', totp: code() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(addAllowlistAddress(ctx, u2, { asset: 'USDT', network: 'ETHEREUM', address: '0xdead000000000000000000000000000000000000', totp: code() })).rejects.toMatchObject({ code: 'SANCTIONED' });
    await allowlistNow({ user: u2, code }, 'USDT', 'TRON');
    await expect(requestWithdrawal(ctx, u2, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '600', totp: code() })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const ok = await requestWithdrawal(ctx, u2, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '400', totp: code() });
    expect(ok.status).toBe('approved');
    await setConfig(ctx.db, 'withdrawals', { paused: true });
    await expect(requestWithdrawal(ctx, u2, { asset: 'USDT', network: 'TRON', address: DEST.TRON, amount: '1', totp: code() })).rejects.toMatchObject({ code: 'WITHDRAWALS_PAUSED' });
    await setConfig(ctx.db, 'withdrawals', { paused: false });
  });

  it('large withdrawals need two distinct admins; failed custody submission reverses the ledger', async () => {
    const u = await mkUser(ctx, { tier: 2 });
    await deposit(u, 'USDT', 'ETHEREUM', toMinor('50000', 6), 100);
    const b = await with2fa(u);
    await allowlistNow(b, 'USDT', 'ETHEREUM');
    const w = await requestWithdrawal(ctx, b.user, { asset: 'USDT', network: 'ETHEREUM', address: DEST.ETHEREUM, amount: '20000', totp: b.code() });
    expect(w.status).toBe('pending_approval');
    expect((await submitWithdrawal(ctx, w.id)).status).toBe('noop');
    const [a1, a2] = await ctx.db.insert(adminUsers).values([{ email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['finance'] }, { email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['finance'] }]).returning();
    expect((await approveWithdrawal(ctx, a1.id, w.id)).status).toBe('pending_approval');
    await expect(approveWithdrawal(ctx, a1.id, w.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await approveWithdrawal(ctx, a2.id, w.id)).status).toBe('approved');
    custody.nextWithdrawalStatus = 'failed';
    expect((await submitWithdrawal(ctx, w.id)).status).toBe('failed');
    custody.nextWithdrawalStatus = 'completed';
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT'))).toBe(toMinor('50000', 6));
    const [row] = await ctx.db.select().from(withdrawals).where(eq(withdrawals.id, w.id));
    expect(row.status).toBe('failed');
  });

  it('high-risk deposits are held for review; internal transfers are free and instant', async () => {
    const u = await mkUser(ctx, { tier: 1 });
    const r = await deposit(u, 'USDT', 'TRON', toMinor('100', 6), 100, uniq('tx'), 'Tbeefmixerxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(r.res.outcome).toBe('held');
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT'))).toBe(0n);
    await reviewHeldDeposit(ctx, (await ctx.db.insert(adminUsers).values({ email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['compliance'] }).returning())[0].id, (r.res as { depositId: string }).depositId, 'credit', 'source verified');
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT'))).toBe(toMinor('100', 6));
    const b = await with2fa(u);
    const v = await mkUser(ctx);
    const t = await internalTransfer(ctx, b.user, { asset: 'USDT', toUserId: v.id, amount: '40', totp: b.code() });
    expect(t.fee).toBe('0');
    expect(await balanceOf(ctx.db, userAcct(v.id, 'USDT'))).toBe(toMinor('40', 6));
    await expect(internalTransfer(ctx, b.user, { asset: 'USDT', toUserId: v.id, amount: '1000', totp: b.code() })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });
});
function fromMinorStr(v: bigint, d: number) { const s = v.toString().padStart(d + 1, '0'); return `${s.slice(0, -d)}.${s.slice(-d)}`; }
