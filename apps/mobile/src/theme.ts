/** Design tokens shared with the web theme (packages/ui/src/theme.css) — KRYPTA gold on black. */
export const BRAND = { name: 'KRYPTA' } as const;
export const palette = {
  dark: {
    bg: '#07080a', card: '#101114', surface: '#15171b', muted: '#1a1c21', border: '#24262c',
    text: '#f5f5f4', sub: '#8c8f98', primary: '#f5b50a', primary2: '#ffcf4a', primary3: '#e09a00', onPrimary: '#111111', info: '#3b82f6', buy: '#18c27a', sell: '#f6465d', warn: '#f0a020', onBuy: '#04130d',
  },
  light: {
    bg: '#f7f6f2', card: '#ffffff', surface: '#ffffff', muted: '#efede6', border: '#e4e1d8',
    text: '#0b0b0c', sub: '#5d606a', primary: '#d99a00', primary2: '#f0b400', primary3: '#c58500', onPrimary: '#111111', info: '#2563eb', buy: '#0e9f62', sell: '#d83148', warn: '#c47f00', onBuy: '#ffffff',
  },
};
export type Colors = typeof palette.dark;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;
export const font = { h1: 30, h2: 22, h3: 18, body: 15, small: 13, tiny: 11 };
export const ASSET_COLORS: Record<string, string> = { USDT: '#26a17b', BTC: '#f7931a', ETH: '#627eea' };
export const NETWORKS: Record<string, string[]> = { USDT: ['TRON', 'TON', 'BSC', 'ETHEREUM', 'POLYGON'], BTC: ['BITCOIN'], ETH: ['ETHEREUM'] };
export const ASSETS = Object.keys(NETWORKS);
