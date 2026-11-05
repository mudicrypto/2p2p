import type { FieldSpec } from '../payments';
export interface CatalogEntry {
  code: string; name: string; region: string; countries: string[]; currencies: string[]; fieldsSchema: FieldSpec[];
  reversible?: boolean; riskLevel?: 'low' | 'medium' | 'high'; verifierAvailable?: boolean; enabled?: boolean; optIn?: boolean; holdHours?: number;
}
const f = (name: string, pattern?: string, opts: Partial<FieldSpec> = {}): FieldSpec => ({ name, type: 'string', pattern, ...opts });
const IBAN = [f('iban', '^[A-Z]{2}\\d{2}[A-Z0-9]{10,30}$'), f('bic', '^[A-Z0-9]{8,11}$', { optional: true })];
const PHONE = [f('phone', '^\\+?\\d{7,15}$')];
const ACCOUNT = [f('bankName', undefined, { max: 80 }), f('accountNumber', '^[0-9A-Za-z -]{4,34}$')];
const EMAIL_OR_PHONE = [f('handle', '^([^@\\s]+@[^@\\s]+|\\+?\\d{7,15})$')];
const SEPA_CC = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'MC', 'SM', 'AD', 'VA'];
const WAEMU = ['SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GW'];
const CEMAC = ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];
const e = (code: string, name: string, region: string, countries: string[], currencies: string[], fieldsSchema: FieldSpec[], o: Partial<CatalogEntry> = {}): CatalogEntry => ({ code, name, region, countries, currencies, fieldsSchema, ...o });

/** Payment method catalog (spec 2b). Seeded; admin-editable without deploy. */
export const PAYMENT_METHOD_CATALOG: CatalogEntry[] = [
  // ---------------- Europe
  e('SEPA', 'SEPA Transfer', 'europe', SEPA_CC, ['EUR'], IBAN),
  e('SEPA_INSTANT', 'SEPA Instant', 'europe', SEPA_CC, ['EUR'], IBAN, { verifierAvailable: true }),
  e('REVOLUT', 'Revolut', 'europe', ['*'], ['EUR', 'GBP', 'USD', 'PLN', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'RON', 'HUF'], [f('revtag', '^@?[a-z0-9._-]{3,32}$')], { riskLevel: 'medium' }),
  e('WISE', 'Wise', 'europe', ['*'], ['EUR', 'GBP', 'USD', 'PLN', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'RON', 'HUF', 'AUD', 'CAD', 'NZD', 'SGD'], [f('email', '^[^@\\s]+@[^@\\s]+$')]),
  e('FASTER_PAYMENTS', 'Faster Payments (UK)', 'europe', ['GB'], ['GBP'], [f('sortCode', '^\\d{2}-?\\d{2}-?\\d{2}$'), f('accountNumber', '^\\d{8}$')], { verifierAvailable: true }),
  e('BLIK', 'BLIK', 'europe', ['PL'], ['PLN'], PHONE),
  e('BIZUM', 'Bizum', 'europe', ['ES'], ['EUR'], PHONE),
  e('IDEAL', 'iDEAL', 'europe', ['NL'], ['EUR'], IBAN),
  e('SATISPAY', 'Satispay', 'europe', ['IT'], ['EUR'], PHONE),
  e('MONOBANK', 'Monobank', 'europe', ['UA'], ['UAH'], [f('cardNumber', '^\\d{16}$')], { riskLevel: 'medium' }),
  e('PRIVATBANK', 'PrivatBank', 'europe', ['UA'], ['UAH'], [f('cardNumber', '^\\d{16}$')], { riskLevel: 'medium' }),
  // ---------------- North America
  e('ACH', 'ACH Transfer', 'north_america', ['US'], ['USD'], [f('routingNumber', '^\\d{9}$'), f('accountNumber', '^\\d{4,17}$')], { riskLevel: 'medium' }),
  e('ZELLE', 'Zelle', 'north_america', ['US'], ['USD'], EMAIL_OR_PHONE, { riskLevel: 'medium' }),
  e('WIRE', 'Bank Wire', 'north_america', ['US', 'CA'], ['USD', 'CAD'], [...ACCOUNT, f('swift', '^[A-Z0-9]{8,11}$', { optional: true })]),
  e('INTERAC', 'Interac e-Transfer', 'north_america', ['CA'], ['CAD'], EMAIL_OR_PHONE),
  e('CASH_APP', 'Cash App', 'north_america', ['US'], ['USD'], [f('cashtag', '^\\$?[A-Za-z0-9_]{1,20}$')], { reversible: true, riskLevel: 'high', optIn: true, holdHours: 72 }),
  e('VENMO', 'Venmo', 'north_america', ['US'], ['USD'], [f('handle', '^@?[A-Za-z0-9_-]{3,30}$')], { reversible: true, riskLevel: 'high', optIn: true, holdHours: 72 }),
  e('CARD', 'Debit/credit card', 'global', ['*'], ['*'], [f('last4', '^\\d{4}$')], { reversible: true, riskLevel: 'high', optIn: true, holdHours: 120 }),
  e('PAYPAL', 'PayPal', 'global', ['*'], ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], [f('email', '^[^@\\s]+@[^@\\s]+$')], { reversible: true, riskLevel: 'high', optIn: true, holdHours: 120 }),
  // ---------------- Latin America
  e('PIX', 'PIX', 'latam', ['BR'], ['BRL'], [f('pixKey', undefined, { max: 77 })], { verifierAvailable: true }),
  e('SPEI', 'SPEI', 'latam', ['MX'], ['MXN'], [f('clabe', '^\\d{18}$')], { verifierAvailable: true }),
  e('MERCADO_PAGO', 'Mercado Pago', 'latam', ['AR', 'MX'], ['ARS', 'MXN'], [f('cvuOrAlias', undefined, { max: 40 })]),
  e('NEQUI', 'Nequi', 'latam', ['CO'], ['COP'], PHONE),
  e('PSE', 'PSE', 'latam', ['CO'], ['COP'], ACCOUNT),
  e('YAPE', 'Yape', 'latam', ['PE'], ['PEN'], PHONE),
  e('PLIN', 'Plin', 'latam', ['PE'], ['PEN'], PHONE),
  e('CVU_CBU', 'CVU/CBU transfer', 'latam', ['AR'], ['ARS'], [f('cbu', '^\\d{22}$')]),
  e('ZINLI', 'Zinli', 'latam', ['VE', 'PA'], ['USD'], [f('email', '^[^@\\s]+@[^@\\s]+$')], { riskLevel: 'medium' }),
  e('PAGO_MOVIL', 'Pago Móvil', 'latam', ['VE'], ['VES'], [f('phone', '^\\+?\\d{7,15}$'), f('bankCode', '^\\d{4}$'), f('nationalId', '^[VEJ]?-?\\d{5,10}$')]),
  // ---------------- Asia
  e('UPI', 'UPI', 'asia', ['IN'], ['INR'], [f('vpa', '^[\\w.-]{2,64}@[A-Za-z]{2,32}$')], { verifierAvailable: true }),
  e('IMPS', 'IMPS', 'asia', ['IN'], ['INR'], [f('ifsc', '^[A-Z]{4}0[A-Z0-9]{6}$'), f('accountNumber', '^\\d{9,18}$')]),
  e('GCASH', 'GCash', 'asia', ['PH'], ['PHP'], PHONE),
  e('MAYA', 'Maya', 'asia', ['PH'], ['PHP'], PHONE),
  e('PROMPTPAY', 'PromptPay', 'asia', ['TH'], ['THB'], [f('promptpayId', '^(\\d{10}|\\d{13})$')], { verifierAvailable: true }),
  e('DUITNOW', 'DuitNow', 'asia', ['MY'], ['MYR'], [f('duitnowId', undefined, { max: 40 })]),
  e('QRIS', 'QRIS', 'asia', ['ID'], ['IDR'], [f('merchantName', undefined, { max: 80 })]),
  e('DANA', 'DANA', 'asia', ['ID'], ['IDR'], PHONE),
  e('OVO', 'OVO', 'asia', ['ID'], ['IDR'], PHONE),
  e('VIETQR', 'VietQR', 'asia', ['VN'], ['VND'], ACCOUNT),
  e('MOMO', 'MoMo', 'asia', ['VN'], ['VND'], PHONE),
  e('PAYNOW', 'PayNow', 'asia', ['SG'], ['SGD'], [f('proxy', undefined, { max: 40 })]),
  e('FPS_HK', 'FPS (Hong Kong)', 'asia', ['HK'], ['HKD'], [f('fpsId', undefined, { max: 40 })]),
  e('TOSS', 'Toss', 'asia', ['KR'], ['KRW'], ACCOUNT),
  e('KAKAOPAY', 'KakaoPay', 'asia', ['KR'], ['KRW'], PHONE),
  e('BKASH', 'bKash', 'asia', ['BD'], ['BDT'], PHONE, { riskLevel: 'medium' }),
  e('NAGAD', 'Nagad', 'asia', ['BD'], ['BDT'], PHONE, { riskLevel: 'medium' }),
  e('EASYPAISA', 'Easypaisa', 'asia', ['PK'], ['PKR'], PHONE, { riskLevel: 'medium' }),
  e('JAZZCASH', 'JazzCash', 'asia', ['PK'], ['PKR'], PHONE, { riskLevel: 'medium' }),
  // ---------------- CIS
  e('SBP', 'SBP (Faster Payments System)', 'cis', ['RU'], ['RUB'], [f('phone', '^\\+?7\\d{10}$'), f('bankName', undefined, { max: 60 })], { verifierAvailable: true }),
  e('KASPI', 'Kaspi', 'cis', ['KZ'], ['KZT'], PHONE),
  e('HUMO', 'Humo', 'cis', ['UZ'], ['UZS'], [f('cardNumber', '^\\d{16}$')]),
  e('UZCARD', 'Uzcard', 'cis', ['UZ'], ['UZS'], [f('cardNumber', '^\\d{16}$')]),
  e('MBANK', 'Mbank', 'cis', ['KG'], ['KGS'], PHONE),
  // ---------------- Middle East
  e('BANK_TRANSFER_GCC', 'Bank transfer (IBAN)', 'middle_east', ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'], ['AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR'], IBAN),
  e('STC_PAY', 'STC Pay', 'middle_east', ['SA'], ['SAR'], PHONE),
  e('PAPARA', 'Papara', 'middle_east', ['TR'], ['TRY'], [f('paparaNumber', '^\\d{10}$')], { riskLevel: 'medium' }),
  e('FAST_TR', 'FAST (Turkey)', 'middle_east', ['TR'], ['TRY'], IBAN),
  e('CLIQ', 'CliQ', 'middle_east', ['JO'], ['JOD'], [f('alias', undefined, { max: 40 })]),
  // ---------------- Africa
  e('MPESA', 'M-Pesa', 'africa', ['KE', 'TZ'], ['KES', 'TZS'], PHONE, { verifierAvailable: true }),
  e('MTN_MOMO', 'MTN MoMo', 'africa', ['GH', 'UG', 'ZM', 'RW'], ['GHS', 'UGX', 'ZMW', 'RWF'], PHONE),
  e('AIRTEL_MONEY', 'Airtel Money', 'africa', ['GH', 'UG', 'ZM', 'RW'], ['GHS', 'UGX', 'ZMW', 'RWF'], PHONE),
  e('OPAY', 'OPay', 'africa', ['NG'], ['NGN'], PHONE),
  e('PALMPAY', 'PalmPay', 'africa', ['NG'], ['NGN'], PHONE),
  e('BANK_TRANSFER_NG', 'Bank transfer (Nigeria)', 'africa', ['NG'], ['NGN'], [f('bankName', undefined, { max: 60 }), f('nuban', '^\\d{10}$')]),
  e('ORANGE_MONEY', 'Orange Money', 'africa', [...WAEMU, ...CEMAC], ['XOF', 'XAF'], PHONE),
  e('WAVE', 'Wave', 'africa', ['SN', 'CI', 'ML', 'BF'], ['XOF'], PHONE),
  e('EFT_ZA', 'EFT (South Africa)', 'africa', ['ZA'], ['ZAR'], ACCOUNT),
  e('PAYSHAP', 'PayShap', 'africa', ['ZA'], ['ZAR'], [f('shapId', undefined, { max: 40 })]),
  // ---------------- Oceania
  e('PAYID', 'PayID', 'oceania', ['AU'], ['AUD'], [f('payId', undefined, { max: 60 })]),
  e('OSKO', 'Osko', 'oceania', ['AU'], ['AUD'], [f('bsb', '^\\d{3}-?\\d{3}$'), f('accountNumber', '^\\d{5,9}$')]),
  e('BANK_TRANSFER_NZ', 'Bank transfer (NZ)', 'oceania', ['NZ'], ['NZD'], [f('accountNumber', '^\\d{2}-?\\d{4}-?\\d{7}-?\\d{2,3}$')]),
  // ---------------- Global
  e('CASH_IN_PERSON', 'Cash in person', 'global', ['*'], ['*'], [f('city', undefined, { max: 60 }), f('meetingNotes', undefined, { max: 200, optional: true })], { riskLevel: 'high', optIn: true }),
  e('GIFT_CARD', 'Gift cards', 'global', ['*'], ['*'], [f('brand', undefined, { max: 40 })], { enabled: false, riskLevel: 'high' }), // disabled: fraud vector
];
