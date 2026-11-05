/** ISO 4217 currencies: [code, name, minor units]. Full list is completed in M9. */
export const ISO_CURRENCIES: Array<[string, string, number]> = [
  ['USD', 'US Dollar', 2], ['EUR', 'Euro', 2], ['GBP', 'Pound Sterling', 2], ['BRL', 'Brazilian Real', 2], ['RUB', 'Russian Ruble', 2],
  ['INR', 'Indian Rupee', 2], ['NGN', 'Naira', 2], ['TRY', 'Turkish Lira', 2], ['ARS', 'Argentine Peso', 2], ['MXN', 'Mexican Peso', 2],
  ['KES', 'Kenyan Shilling', 2], ['PHP', 'Philippine Peso', 2], ['IDR', 'Rupiah', 2], ['VND', 'Dong', 0], ['UAH', 'Hryvnia', 2],
  ['KZT', 'Tenge', 2], ['JPY', 'Yen', 0], ['KRW', 'Won', 0], ['THB', 'Baht', 2],
];
export const ENABLED_FIATS = new Set(['USD', 'EUR', 'GBP', 'BRL', 'RUB', 'INR', 'NGN', 'TRY', 'ARS', 'MXN', 'KES', 'PHP', 'IDR', 'VND', 'UAH', 'KZT', 'JPY', 'KRW', 'THB']);
