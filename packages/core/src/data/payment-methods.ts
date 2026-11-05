import type { FieldSpec } from '../payments';
export interface CatalogEntry {
  code: string; name: string; region: string; countries: string[]; currencies: string[]; fieldsSchema: FieldSpec[];
  reversible?: boolean; riskLevel?: 'low' | 'medium' | 'high'; verifierAvailable?: boolean; enabled?: boolean; optIn?: boolean; holdHours?: number;
}
const IBAN: FieldSpec[] = [{ name: 'iban', type: 'string', pattern: '^[A-Z]{2}\\d{2}[A-Z0-9]{10,30}$' }, { name: 'bic', type: 'string', optional: true, max: 11 }];
/** Payment method catalog (spec 2b). Completed in M9. */
export const PAYMENT_METHOD_CATALOG: CatalogEntry[] = [
  { code: 'SEPA', name: 'SEPA Transfer', region: 'europe', countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'AT', 'BE', 'PT', 'IE', 'FI'], currencies: ['EUR'], fieldsSchema: IBAN },
  { code: 'SEPA_INSTANT', name: 'SEPA Instant', region: 'europe', countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'AT', 'BE', 'PT', 'IE', 'FI'], currencies: ['EUR'], fieldsSchema: IBAN, verifierAvailable: true },
  { code: 'PIX', name: 'PIX', region: 'latam', countries: ['BR'], currencies: ['BRL'], fieldsSchema: [{ name: 'pixKey', type: 'string', max: 77 }], verifierAvailable: true },
  { code: 'VENMO', name: 'Venmo', region: 'north_america', countries: ['US'], currencies: ['USD'], fieldsSchema: [{ name: 'handle', type: 'string', pattern: '^@?[A-Za-z0-9_-]{3,30}$' }], reversible: true, riskLevel: 'high', optIn: true, holdHours: 72 },
];
