/** Region grouping for the market "Regions" filter (frontend-only; payment method types carry country lists). */
export const REGIONS: Record<string, string[]> = {
  africa: ['BF', 'BJ', 'CF', 'CG', 'CI', 'CM', 'GA', 'GH', 'GQ', 'GW', 'KE', 'ML', 'NE', 'NG', 'RW', 'SN', 'TD', 'TG', 'TZ', 'UG', 'ZA', 'ZM'],
  europe: ['AD', 'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA'],
  asia: ['BD', 'HK', 'ID', 'IN', 'KG', 'KR', 'KZ', 'MY', 'PH', 'PK', 'SG', 'TH', 'UZ', 'VN', 'RU'],
  mena: ['AE', 'BH', 'JO', 'KW', 'OM', 'QA', 'SA', 'TR'],
  latam: ['AR', 'BR', 'CO', 'MX', 'PA', 'PE', 'VE'],
  northAmerica: ['US', 'CA'],
  oceania: ['AU', 'NZ'],
};
export const REGION_KEYS = Object.keys(REGIONS);
/** Payment method type codes usable in a region ('*' types are global). */
export function typesForRegion(types: Array<{ code: string; countries?: string[] }>, region: string) {
  if (!region) return null;
  const cs = new Set(REGIONS[region] ?? []);
  return new Set(types.filter((t) => (t.countries ?? []).some((c) => c === '*' || cs.has(c))).map((t) => t.code));
}
