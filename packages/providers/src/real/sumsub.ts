import { createHmac, timingSafeEqual } from 'node:crypto';
import type { KycLevel, KycProvider, KycResult, KycSession } from '../interfaces';
import { httpJson, requireEnv } from './http';

const LEVEL_NAMES: Record<KycLevel, string> = { 1: 'tier1-liveness-id', 2: 'tier2-address', 3: 'tier3-merchant' };
/** Sumsub adapter (sandbox base URL by default). TODO(provider): verify level names against the Sumsub dashboard once keys exist. */
export class SumsubKyc implements KycProvider {
  readonly name = 'sumsub';
  private base = process.env.SUMSUB_BASE_URL ?? 'https://api.sumsub.com';
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = body ? JSON.stringify(body) : '';
    const sig = createHmac('sha256', requireEnv('SUMSUB_SECRET_KEY')).update(ts + method + path + payload).digest('hex');
    return httpJson<T>(this.base + path, {
      method, body: payload || undefined,
      headers: { 'content-type': 'application/json', 'X-App-Token': requireEnv('SUMSUB_APP_TOKEN'), 'X-App-Access-Ts': ts, 'X-App-Access-Sig': sig },
    });
  }
  async createApplicant(userId: string, level: KycLevel): Promise<KycSession> {
    const levelName = LEVEL_NAMES[level];
    const a = await this.call<{ id: string }>('POST', `/resources/applicants?levelName=${levelName}`, { externalUserId: userId });
    const t = await this.call<{ token: string }>('POST', `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${levelName}`);
    return { providerRef: a.id, accessToken: t.token };
  }
  async getResult(ref: string): Promise<KycResult> {
    const a = await this.call<any>('GET', `/resources/applicants/${ref}/one`);
    const ans = a.review?.reviewResult?.reviewAnswer;
    const info = a.info ?? {};
    return {
      eventId: `${ref}:${a.review?.reviewDate ?? ''}`, providerRef: ref,
      status: ans === 'GREEN' ? 'approved' : ans === 'RED' ? 'rejected' : 'pending',
      level: (Number(Object.entries(LEVEL_NAMES).find(([, n]) => n === a.review?.levelName)?.[0]) || 1) as KycLevel,
      fullName: [info.firstName, info.lastName].filter(Boolean).join(' ') || undefined, dob: info.dob, country: info.country,
    };
  }
  verifyWebhook(body: string, headers: Record<string, string | undefined>) {
    const sig = headers['x-payload-digest'];
    if (!sig) return false;
    const exp = createHmac('sha256', requireEnv('SUMSUB_WEBHOOK_SECRET')).update(body).digest('hex');
    return sig.length === exp.length && timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
  }
  parseWebhook(body: string): KycResult {
    const j = JSON.parse(body);
    const ans = j.reviewResult?.reviewAnswer;
    return {
      eventId: `${j.applicantId}:${j.correlationId ?? j.createdAtMs}`, providerRef: j.applicantId,
      status: ans === 'GREEN' ? 'approved' : ans === 'RED' ? 'rejected' : 'pending',
      level: (Number(Object.entries(LEVEL_NAMES).find(([, n]) => n === j.levelName)?.[0]) || 1) as KycLevel,
      rejectReason: j.reviewResult?.moderationComment,
    };
  }
}
