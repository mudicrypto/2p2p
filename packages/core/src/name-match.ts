/**
 * Payer-name matching (spec 6): the fiat payer must be the buyer (KYC name). Banks format names
 * inconsistently (case, order, diacritics, initials, Cyrillic), so we normalize before comparing.
 */
const CYR: Record<string, string> = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA', І: 'I', Ї: 'YI', Є: 'YE', Ґ: 'G' };
const HONORIFICS = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SR', 'SRA', 'SNR', 'JR', 'HERR', 'FRAU', 'MME', 'MLLE', 'SIG', 'SIGRA']);
const PARTICLES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'DEL', 'LA', 'VAN', 'VON', 'DER', 'DI', 'E', 'Y', 'BIN', 'BINTI', 'AL']);

export function nameTokens(name: string): string[] {
  const up = name.toUpperCase().replace(/[А-ЯЁІЇЄҐ]/g, (c) => CYR[c] ?? c);
  const ascii = up.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s.'-]/g, ' ');
  return ascii.split(/[\s.'-]+/).filter(Boolean).filter((t) => !HONORIFICS.has(t) && !PARTICLES.has(t));
}

/** true when the payer name plausibly refers to the same person as the KYC name. */
export function namesMatch(kycName: string, payerName: string): boolean {
  const a = nameTokens(kycName); const b = nameTokens(payerName);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1) return long.length === 1 && short[0] === long[0];
  const pool = [...long];
  let full = 0;
  for (const t of short) {
    let i = pool.indexOf(t);
    if (i >= 0) { full++; pool.splice(i, 1); continue; }
    // Initials: "J" matches "JOHN" (but at least two full-token matches are still required overall).
    if (t.length === 1) { i = pool.findIndex((p) => p.startsWith(t)); if (i >= 0) { pool.splice(i, 1); continue; } }
    if (t.length > 1 && (i = pool.findIndex((p) => p.length === 1 && t.startsWith(p))) >= 0) { pool.splice(i, 1); continue; }
    return false;
  }
  return full >= Math.min(2, short.length);
}
