/** Design tokens shared with the web theme (packages/ui/src/theme.css). */
export const palette = {
  dark: {
    bg: '#090b10', card: '#11141b', surface: '#171b25', muted: '#1b1f2a', border: '#232838',
    text: '#f4f6fb', sub: '#8a91a6', primary: '#7b61ff', primary2: '#37c8ff', buy: '#1fcb8b', sell: '#ff4d6a', warn: '#ffb020', onBuy: '#04130d',
  },
  light: {
    bg: '#f6f7fb', card: '#ffffff', surface: '#ffffff', muted: '#eef0f6', border: '#e3e6ef',
    text: '#0b0d12', sub: '#5f667a', primary: '#6a4dff', primary2: '#1fb6f0', buy: '#0faa6f', sell: '#e8344f', warn: '#d98a00', onBuy: '#ffffff',
  },
};
export type Colors = typeof palette.dark;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;
export const font = { h1: 30, h2: 22, h3: 18, body: 15, small: 13, tiny: 11 };
export const ASSET_COLORS: Record<string, string> = { USDT: '#26a17b', BTC: '#f7931a', ETH: '#627eea' };
export const NETWORKS: Record<string, string[]> = { USDT: ['TRON', 'TON', 'BSC', 'ETHEREUM', 'POLYGON'], BTC: ['BITCOIN'], ETH: ['ETHEREUM'] };
export const ASSETS = Object.keys(NETWORKS);
