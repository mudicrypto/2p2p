/** CSV export helpers. */
const CSV_COLS = ['id', 'createdAt', 'role', 'status', 'asset', 'cryptoAmount', 'fiat', 'fiatAmount', 'price', 'counterparty'] as const;
const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };
/** Orders as CSV (RFC 4180; cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas). */
export function ordersCsv(rows: any[]) {
  const lines = rows.map((o) => CSV_COLS.map((c) => cell(c === 'counterparty' ? (o.counterparty?.displayName ?? o.counterparty?.id ?? '') : o[c])).join(','));
  return [CSV_COLS.join(','), ...lines].join('\r\n');
}
