/**
 * Real adapters that need credentials before they can be written against a live sandbox.
 * They fail loudly instead of silently pretending. The registry only selects them when the keys exist.
 */
import type { ChainRiskProvider, CustodyProvider, RiskScreenResult } from '../interfaces';
import { httpJson, requireEnv } from './http';

// TODO(provider): Fireblocks — needs FIREBLOCKS_API_KEY + RSA secret (JWT-signed requests), vault account mapping per user.
export function createFireblocksCustody(): CustodyProvider {
  requireEnv('FIREBLOCKS_API_KEY');
  requireEnv('FIREBLOCKS_SECRET_PATH');
  throw new Error('TODO(provider): Fireblocks adapter requires sandbox credentials to implement and verify');
}

/** TRM Labs address screening. TODO(provider): confirm response shape against the sandbox once a key exists. */
export class TrmChainRisk implements ChainRiskProvider {
  readonly name = 'trm';
  async screenAddress(network: string, address: string): Promise<RiskScreenResult> {
    const auth = Buffer.from(`${requireEnv('TRM_API_KEY')}:${requireEnv('TRM_API_KEY')}`).toString('base64');
    const chain = ({ TRON: 'tron', ETHEREUM: 'ethereum', BSC: 'binance_smart_chain', POLYGON: 'polygon', BITCOIN: 'bitcoin', TON: 'ton' } as Record<string, string>)[network];
    const r = await httpJson<Array<{ addressRiskIndicators: Array<{ category: string; riskType: string }>; entities: Array<{ riskScoreLevel: number }> }>>(
      'https://api.trmlabs.com/public/v2/screening/addresses',
      { method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify([{ address, chain }]) },
    );
    const row = r[0];
    const cats = row?.addressRiskIndicators.map((i) => i.category) ?? [];
    const sanctioned = cats.some((c) => /sanction/i.test(c));
    const score = Math.max(0, ...(row?.entities.map((e) => e.riskScoreLevel) ?? [0]));
    return { score: sanctioned ? 100 : score, sanctioned, categories: cats };
  }
  async screenPerson(): Promise<{ hit: boolean; lists: string[] }> {
    throw new Error('TODO(provider): person sanctions screening provider not selected (TRM does wallets only)');
  }
}
