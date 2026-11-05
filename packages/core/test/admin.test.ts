import { describe, it, expect, afterAll } from 'vitest';
import { auditLog, eq, and } from '@p2p/db';
import { makeCtx, mkUser, uniq } from './helpers';
import { SoftAuthenticator } from '../src/testing/soft-authenticator';
import { createAdmin, adminLogin, adminWebauthn, adminKeyRegistrationOptions, adminKeyRegister, authenticateAdmin, can, ipAllowed, userDetail, setUserStatus, createSuspiciousActivityReport, reportToCsv, upsertCountryRule } from '../src';

const ctx = makeCtx();
afterAll(() => ctx.close());

describe('M6 admin auth & RBAC', () => {
  it('password + IP allowlist + hardware key (WebAuthn) are all required', async () => {
    const email = `${uniq()}@admin.io`;
    await createAdmin(ctx, null, { email, password: 'admin-password-1', roles: ['compliance'] });
    await expect(adminLogin(ctx, email, 'admin-password-1', '8.8.8.8')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminLogin(ctx, email, 'wrong', '127.0.0.1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const l1 = await adminLogin(ctx, email, 'admin-password-1', '127.0.0.1');
    expect(l1.needsRegistration).toBe(true);
    expect(await authenticateAdmin(ctx, l1.token, '127.0.0.1')).toBeNull(); // no WebAuthn yet
    const key = new SoftAuthenticator();
    await adminKeyRegister(ctx, l1.token, key.register(await adminKeyRegistrationOptions(ctx, l1.token)));
    const l2 = await adminLogin(ctx, email, 'admin-password-1', '127.0.0.1');
    const other = new SoftAuthenticator();
    await expect(adminWebauthn(ctx, l2.token, other.assert(l2.webauthnOptions))).rejects.toThrow();
    const l3 = await adminLogin(ctx, email, 'admin-password-1', '127.0.0.1');
    await adminWebauthn(ctx, l3.token, key.assert(l3.webauthnOptions));
    const s = await authenticateAdmin(ctx, l3.token, '127.0.0.1');
    expect(s?.admin.email).toBe(email);
    expect(await authenticateAdmin(ctx, l3.token, '10.0.0.9')).toBeNull(); // IP pinned to allowlist
  });

  it('role matrix and PII masking', async () => {
    expect(can(['support'], 'users.read')).toBe(true);
    expect(can(['support'], 'users.read_pii')).toBe(false);
    expect(can(['arbiter'], 'withdrawals.approve')).toBe(false);
    expect(can(['finance'], 'withdrawals.approve')).toBe(true);
    expect(can(['superadmin'], 'admins.manage')).toBe(true);
    expect(can(['compliance'], 'admins.manage')).toBe(false);
    expect(ipAllowed('::ffff:127.0.0.1')).toBe(true);
    const u = await mkUser(ctx);
    const support = await createAdmin(ctx, null, { email: `${uniq()}@a.io`, password: 'x'.repeat(12), roles: ['support'] });
    const comp = await createAdmin(ctx, null, { email: `${uniq()}@a.io`, password: 'x'.repeat(12), roles: ['compliance'] });
    const vs = await userDetail(ctx, support, u.id);
    expect(vs.user.email).toMatch(/\*\*\*/);
    expect(vs.flags).toBeUndefined();
    const vc = await userDetail(ctx, comp, u.id);
    expect(vc.user.email).toBe(u.email);
    await setUserStatus(ctx, comp, u.id, 'frozen', 'investigation');
    const r = await createSuspiciousActivityReport(ctx, comp, { kind: 'SAR', userId: u.id, narrative: 'structuring pattern' });
    expect(reportToCsv(r.payload)).toContain('section');
    await upsertCountryRule(ctx, comp, 'xx', { status: 'blocked' });
    const actions = (await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, comp.id)))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['admin.view_user', 'user.status_changed', 'report.sar_created', 'country_rules.changed']));
  });
});
