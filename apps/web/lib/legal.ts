/**
 * Legal documents (English master). DRAFT templates — must be reviewed and completed by counsel for each
 * jurisdiction before launch (placeholders in [BRACKETS]). Country-specific disclosures come from country_rules.
 */
export interface LegalDoc { title: string; updated: string; sections: Array<{ h: string; p: string[] }> }
export const LEGAL: Record<'terms' | 'privacy' | 'risk', LegalDoc> = {
  terms: {
    title: 'Terms of Service', updated: '2026-11-06',
    sections: [
      { h: '1. Who we are', p: ['[COMPANY LEGAL NAME], registered in [JURISDICTION] (registration [NUMBER]), operates this peer-to-peer platform ("we", "the Platform"). Where required we are registered/licensed as [VASP/MSB REGISTRATION DETAILS].'] },
      { h: '2. What the Platform does', p: ['The Platform lets users trade crypto-assets (USDT, BTC, ETH) for fiat money directly with each other. Fiat payments are made directly between users outside the Platform; the Platform holds the seller\'s crypto in escrow until the trade is completed, cancelled or decided by an arbiter. We are not a party to the fiat payment and do not hold users\' fiat.'] },
      { h: '3. Eligibility and verification', p: ['You must be at least 18 years old and reside in a country where the Platform is offered. Access, limits and features depend on your verification tier. We screen all users against sanctions lists and may refuse, limit, suspend or close accounts where required by law or to prevent fraud.'] },
      { h: '4. Trading rules', p: ['Pay only from an account in your own verified name and include the order reference code. Never mark an order as paid before paying, and never release crypto before the money is in your account. Keep all communication and payments on the Platform; off-platform deals are not protected. Third-party payments are refunded and may lead to account restrictions.', 'Buyers cannot cancel an order after marking it paid; disagreements go to the dispute process. Arbiter decisions are final as between the parties, without prejudice to statutory rights.'] },
      { h: '5. Fees', p: ['Takers pay no trading fee. Makers pay the fee shown at order time (default 0.1%), charged in crypto at completion. Network fees apply to withdrawals. Current fees are published on the Platform.'] },
      { h: '6. Wallet', p: ['Crypto is held with our regulated custodian [CUSTODIAN]. Withdrawals require 2FA, an allow-listed address (new addresses activate after 24 hours) and may be reviewed or delayed for security, compliance or during our launch period, when all withdrawals are manually approved.'] },
      { h: '7. Prohibited use', p: ['No money laundering, terrorist financing, sanctions evasion, fraud, chargeback abuse, multiple accounts, market manipulation, or use on behalf of third parties. We report suspicious activity to the competent authorities.'] },
      { h: '8. Liability', p: ['To the extent permitted by law, we are not liable for losses caused by your counterparty, your payment provider, blockchain networks, or your failure to follow these rules. Nothing in these Terms limits liability that cannot be limited by law.'] },
      { h: '9. Changes, law and contact', p: ['We may change these Terms with notice. Governing law: [LAW]; courts of [VENUE], subject to mandatory consumer protections. Contact: [SUPPORT EMAIL].'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy', updated: '2026-11-06',
    sections: [
      { h: '1. Controller', p: ['[COMPANY LEGAL NAME], [ADDRESS]. Data protection officer: [DPO EMAIL].'] },
      { h: '2. Data we process', p: ['Account data (email, phone, Telegram id, country, language); verification data from our KYC provider (name, date of birth, document and liveness results, proof of address); device and log data (device fingerprint, IP address, user agent); trading data (orders, chat, attachments, disputes, feedback); payment details you add (stored encrypted); wallet data (addresses, transactions).'] },
      { h: '3. Why we process it', p: ['To provide the service (contract); to verify identity, screen sanctions, prevent fraud and meet anti-money-laundering, tax and record-keeping duties (legal obligation); to secure the Platform and improve it (legitimate interests); marketing only with consent.'] },
      { h: '4. Sharing', p: ['With our processors: identity verification, custody, blockchain analytics, payment-verification, messaging and hosting providers, under data processing agreements; with your counterparty only what is needed to complete a trade (display name, payment details you chose to use); with authorities where legally required. Automated risk checks may restrict actions; you can request human review.'] },
      { h: '5. Retention and security', p: ['Verification and transaction records are kept for [5–10] years after account closure as required by AML law; other data for as long as needed. Personal data and payment details are encrypted at field level; access is role-based and audited.'] },
      { h: '6. Your rights', p: ['Access, rectification, erasure (subject to legal retention), restriction, portability, objection and complaint to your supervisory authority. Contact [DPO EMAIL].'] },
      { h: '7. International transfers', p: ['Where data leaves your region we use adequacy decisions or standard contractual clauses.'] },
    ],
  },
  risk: {
    title: 'Risk Disclosure', updated: '2026-11-06',
    sections: [
      { h: 'Crypto-assets are high risk', p: ['Prices can fall sharply and you can lose all the money you exchange. Stablecoins can lose their peg. Crypto-assets are generally not covered by deposit guarantee or investor compensation schemes.'] },
      { h: 'Peer-to-peer risks', p: ['You deal with other users. Fiat payments can be reversed, frozen by banks, or come from third parties; reversible payment methods carry chargeback risk. Escrow protects the crypto side only if you follow the trading rules. The insurance fund may compensate approved bank-freeze claims within its limits but is not a guarantee.'] },
      { h: 'Operational risks', p: ['Blockchain networks, custodians and payment providers can fail or be delayed. Sending crypto to a wrong address or network is usually irreversible.'] },
      { h: 'Regulatory and tax', p: ['Rules differ by country and can change; services may be restricted in your country. You are responsible for your taxes.'] },
    ],
  },
};
