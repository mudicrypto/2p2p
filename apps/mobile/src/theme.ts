/** Design tokens shared with the web theme (packages/ui/src/theme.css): parley warm neutrals + sand accent. */
export const BRAND = { name: 'parley', tagline: 'Trade with people. Protected by escrow.' } as const;
export const palette = {
  dark: {
    bg: '#111214', card: '#1c1d20', surface: '#26272b', muted: '#2a2b2f', border: '#2e2f33',
    text: '#f4f2ee', sub: '#a3a19c', primary: '#e2c38a', primary2: '#ecd4a6', primary3: '#d4b073', onPrimary: '#1a1714', info: '#a9bdf5', buy: '#9fd49a', sell: '#ec8670', warn: '#e2c38a', onBuy: '#16301a',
    ink: '#f3f1ec', onInk: '#161513', glow: 'rgba(150,98,42,0.55)',
  },
  light: {
    bg: '#ebe9e4', card: '#ffffff', surface: '#ffffff', muted: '#ecebe8', border: '#e6e3dd',
    text: '#1a1815', sub: '#6f6c66', primary: '#e2c38a', primary2: '#ecd4a6', primary3: '#d4b073', onPrimary: '#1a1714', info: '#3b5bc4', buy: '#1f6b33', sell: '#e0705a', warn: '#b38634', onBuy: '#ffffff',
    ink: '#1a1815', onInk: '#ffffff', glow: 'rgba(250,214,186,0.85)',
  },
};
export type Colors = typeof palette.dark;
export const radius = { sm: 12, md: 16, lg: 24, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;
export const font = { h1: 32, h2: 24, h3: 19, body: 16, small: 14, tiny: 12 };
export const ASSET_COLORS: Record<string, string> = { USDT: '#26a17b', BTC: '#f7931a', ETH: '#627eea' };
export const NETWORKS: Record<string, string[]> = { USDT: ['TRON', 'TON', 'BSC', 'ETHEREUM', 'POLYGON'], BTC: ['BITCOIN'], ETH: ['ETHEREUM'] };
export const ASSETS = Object.keys(NETWORKS);
