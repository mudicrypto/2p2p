export * from '../src';
export const fromMinorSafe = (v: bigint, d: number) => { const s = v.toString().padStart(d + 1, '0'); return `${s.slice(0, -d)}.${s.slice(-d)}`; };
