'use client';
/** Decorative dotted night-globe (pure SVG, deterministic, no external assets). */
import { useMemo } from 'react';

// Continents as soft ellipses [lon, lat, rx, ry] — organic edges with a little noise, no external map data.
const LAND: Array<[number, number, number, number]> = [
  [20, 8, 19, 27], [12, 12, 14, 9], [40, 6, 6, 8], [47, -19, 3, 7], [25, -26, 9, 7], // Africa + Madagascar
  [12, 50, 18, 9], [25, 58, 14, 8], [-3, 54, 3, 4], [15, 64, 8, 6], // Europe
  [45, 25, 10, 9], [78, 20, 9, 11], [100, 15, 9, 8], [105, 35, 22, 13], [90, 55, 40, 11], [135, 40, 5, 9], // Asia
  [118, -1, 12, 6], [134, -25, 17, 11], [-60, -12, 15, 22], [-68, -38, 6, 14], [-100, 40, 26, 14], [-100, 58, 30, 10], [-42, 72, 13, 8],
];
const landScore = (lon: number, lat: number) => {
  let best = 0;
  for (const [x, y, rx, ry] of LAND) {
    let dx = lon - x; if (dx > 180) dx -= 360; if (dx < -180) dx += 360;
    best = Math.max(best, 1 - ((dx / rx) ** 2 + ((lat - y) / ry) ** 2));
  }
  return best;
};

export function Globe({ size = 520, rotate = -20, className }: { size?: number; rotate?: number; className?: string }) {
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number; r: number; o: number; city: boolean }> = [];
    const R = size / 2 - 4;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let lat = -78; lat <= 80; lat += 2.4) {
      const step = 2.4 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      for (let lon = -180; lon < 180; lon += step) {
        const l = ((lon + rotate + 540) % 360) - 180;
        if (Math.abs(l) > 88) continue;
        const phi = (lat * Math.PI) / 180; const lam = (l * Math.PI) / 180;
        const x = R * Math.cos(phi) * Math.sin(lam); const y = -R * Math.sin(phi);
        const z = Math.cos(phi) * Math.cos(lam);
        const land = landScore(lon, lat) + (rnd() - 0.5) * 0.35 > 0.05;
        if (!land && rnd() > 0.06) continue;
        const city = land && rnd() > 0.9;
        out.push({ x: x + size / 2, y: y + size / 2, r: (land ? 1.25 : 0.7) * (0.6 + z * 0.6), o: (land ? 0.6 : 0.1) * (0.35 + z * 0.75), city });
      }
    }
    return out;
  }, [size, rotate]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <defs>
        <radialGradient id="g-atm" cx="45%" cy="40%" r="60%"><stop offset="0%" stopColor="#1a1408" /><stop offset="70%" stopColor="#0a0a0b" /><stop offset="100%" stopColor="#07080a" /></radialGradient>
        <radialGradient id="g-rim" cx="50%" cy="50%" r="50%"><stop offset="88%" stopColor="rgba(245,181,10,0)" /><stop offset="97%" stopColor="rgba(245,181,10,0.35)" /><stop offset="100%" stopColor="rgba(245,181,10,0)" /></radialGradient>
        <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>
      <circle className="globe-atm" cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="url(#g-atm)" />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#f5b50a" opacity={d.o} />)}
      <g filter="url(#g-glow)">{dots.filter((d) => d.city).map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r * 1.9} fill="#ffd866" opacity={Math.min(1, d.o * 1.8)} />)}</g>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="url(#g-rim)" />
    </svg>
  );
}
