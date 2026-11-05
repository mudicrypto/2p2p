import { applyBps } from '@p2p/shared';
import type { ConfigOf } from './config';

/** Maker pays the fee (default 0.1%); taker 0% (spec 8). Merchant levels lower maker fees. */
export function makerFeeBps(cfg: ConfigOf<'fees'>, merchantLevel = 0): number {
  const lvl = cfg.merchantLevelMakerBps[String(merchantLevel)];
  return merchantLevel > 0 && lvl !== undefined ? Math.min(lvl, cfg.makerBps) : cfg.makerBps;
}
export function computeFee(cfg: ConfigOf<'fees'>, cryptoAmount: bigint, merchantLevel = 0) {
  const fee = applyBps(cryptoAmount, makerFeeBps(cfg, merchantLevel), 'half_up');
  const insurance = applyBps(fee, cfg.insuranceShareBps, 'floor');
  return { fee, insurance, platform: fee - insurance };
}
