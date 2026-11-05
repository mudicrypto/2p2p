/** Crypto assets and their networks. Decimals are fixed by the spec (section 0.1). */
export const ASSETS = {
  USDT: { decimals: 6, networks: ['TRON', 'TON', 'BSC', 'ETHEREUM', 'POLYGON'] },
  BTC: { decimals: 8, networks: ['BITCOIN'] },
  ETH: { decimals: 18, networks: ['ETHEREUM'] },
} as const;

export type Asset = keyof typeof ASSETS;
export const ASSET_LIST = Object.keys(ASSETS) as Asset[];
export type Network = (typeof ASSETS)[Asset]['networks'][number];
export const NETWORK_LIST: Network[] = Array.from(
  new Set(Object.values(ASSETS).flatMap((a) => a.networks as readonly Network[])),
);

export function isAsset(x: string): x is Asset {
  return Object.prototype.hasOwnProperty.call(ASSETS, x);
}
export function assetDecimals(asset: Asset): number {
  return ASSETS[asset].decimals;
}
export function assetSupportsNetwork(asset: Asset, network: string): network is Network {
  return (ASSETS[asset].networks as readonly string[]).includes(network);
}
