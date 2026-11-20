/**
 * Legal documents (English master). DRAFT templates — must be reviewed and completed by counsel for each
 * jurisdiction before launch (placeholders in [BRACKETS]). Country-specific disclosures come from country_rules.
 * docs/legal/*.md are generated from this file (scripts/export-legal.mjs) for review by counsel.
 */
export interface LegalDoc { title: string; updated: string; sections: Array<{ h: string; p: string[] }> }
export type LegalKey = 'terms' | 'privacy' | 'risk' | 'merchant-rules' | 'delete-account';
export const LEGAL: Record<LegalKey, LegalDoc> = {
  terms: {
    title: 'Terms of Service', updated: '2026-11-20',
    sections: [
      { h: '1. Who we are', p: ['[COMPANY LEGAL NAME], registered in [JURISDICTION] (registration [NUMBER]), operates the parley peer-to-peer platform at [DOMAIN] and in the parley apps ("we", "the Platform"). Where required we are registered or licensed as [VASP/MSB REGISTRATION DETAILS].'] },
      { h: '2. What the Platform does', p: ['The Platform lets users trade crypto-assets (USDT, BTC, ETH) for fiat money directly with each other. Fiat payments are made directly between users outside the Platform; the Platform holds the seller\'s crypto in escrow until the trade is completed, cancelled or decided by an arbiter. We are not a party to the fiat payment and do not hold users\' fiat.', 'Large trades can be requested through our large-trade desk; any such trade is agreed separately and in writing.'] },
      { h: '3. Eligibility, accounts and verification', p: ['You must be at least 18 years old and reside in a country where the Platform is offered. One account per person. Limits and features depend on your verification tier and your country, and are shown in the app. We screen all users against sanctions lists and may refuse, limit, suspend or close accounts where required by law or to prevent fraud.', 'You choose a public nickname. It must not impersonate parley, our staff or another person, and must not be offensive. We may change or remove nicknames that break this rule.'] },
      { h: '4. Trading rules', p: ['Include the order reference code with your payment and send exactly the order amount to the payment details shown in the order. Never mark an order as paid before paying, and never release crypto before the money is in your account. Keep all communication and payments on the Platform; off-platform deals are not protected. Messages that try to move a trade off the Platform are blocked, and messages matching common scam patterns are shown to the other party with a caution.', 'Buyers cannot cancel an order after marking it paid; disagreements go to the dispute process. Arbiter decisions are final as between the parties, without prejudice to statutory rights.', 'Advertisers may set conditions for who can trade with them (verification level, account age, completed trades), business hours, an automatic first message, and a break mode that hides their ads. You can follow or block other users; blocked users cannot see each other\'s ads or trade together.'] },
      { h: '5. Fees and paid features', p: ['Takers pay no trading fee. Makers pay the fee shown at order time (default 0.1%, lower for higher merchant levels), charged in crypto at completion. Network fees apply to withdrawals.', 'Ad promotion is optional: the price per day is shown before you pay, it is charged in USDT from your wallet when you confirm, and it is not refundable once the promotion has started. Promoted ads are labelled "Promoted" and are shown only to users whose filters they match.', 'Current fees and prices are published on the Platform.'] },
      { h: '6. Wallet', p: ['Crypto is held with our custodian [CUSTODIAN]. Withdrawals require 2FA, an allow-listed address (new addresses activate after 24 hours) and may be reviewed or delayed for security or compliance reasons, or during our launch period, when withdrawals may be manually approved.'] },
      { h: '7. Invite program', p: ['Each account has an invite code. When a person who signed up with your code completes their first trade of at least the minimum value shown in the app with someone other than you, we pay you the invite reward shown in the app, once per invited person, while the program is running and the rewards fund has money. We may change or end the program with notice, and we withhold rewards obtained through self-invites, fake accounts or other abuse.'] },
      { h: '8. Safety features', p: ['To protect users we run automatic checks, for example on uploaded payment receipts (reused files, editing software, dates, and, where enabled, the amount and names shown), on chat messages and on order risk. Results are advisory and shown to the parties and to arbiters; a person decides any dispute. A trust score built from your trading history is shown on your public profile.'] },
      { h: '9. Prohibited use', p: ['No money laundering, terrorist financing, sanctions evasion, fraud, chargeback abuse, fake receipts, multiple accounts, invite abuse, market manipulation, or use on behalf of third parties. We report suspicious activity to the competent authorities.'] },
      { h: '10. Liability', p: ['To the extent permitted by law, we are not liable for losses caused by your counterparty, your payment provider, blockchain networks, translations or automatic checks, or your failure to follow these rules. Nothing in these Terms limits liability that cannot be limited by law.'] },
      { h: '11. Changes, law and contact', p: ['We may change these Terms with notice in the app or by email. Governing law: [LAW]; courts of [VENUE], subject to mandatory consumer protections. Contact: [SUPPORT EMAIL].'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy', updated: '2026-11-20',
    sections: [
      { h: '1. Controller', p: ['[COMPANY LEGAL NAME], [ADDRESS]. Data protection officer: [DPO EMAIL].'] },
      { h: '2. Data we process', p: ['Account data: email, phone, Telegram chat id (if you sign in with or link Telegram), country, language, nickname, settings (business hours, break mode, anti-phishing code, saved searches, price alerts). Verification data from our KYC provider: name, date of birth, document and liveness results, proof of address. Device and log data: device fingerprint, IP address, user agent, last time you were active. Trading data: orders, chat, uploaded receipts and evidence and the results of automatic checks on them, disputes, feedback, follows and blocks, invite relationships and rewards. Payment details you add (stored encrypted). Wallet data: addresses, transactions.'] },
      { h: '3. Why we process it', p: ['To provide the service (contract); to verify identity, screen sanctions, prevent fraud and meet anti-money-laundering, tax and record-keeping duties (legal obligation); to secure the Platform, detect scams and improve the service (legitimate interests); marketing only with consent.'] },
      { h: '4. What other users see', p: ['Your nickname, verification level, trust score and trading statistics, whether you are online or when you were last active, break mode and business hours. In a trade, your counterparty sees what is needed to complete it: the payment details you chose to use, chat messages and files you send, and, for sellers, plain facts about the buyer that call for extra care (for example a new account) and the buyer\'s verified name where available.'] },
      { h: '5. Automated checks and profiling', p: ['We compute a trust score from your trading history, check uploaded receipts and chat messages for known scam patterns, and score orders for fraud risk. These checks can show cautions or require manual review; they do not by themselves decide a dispute. You can ask for a human review of any automated decision that affects you.'] },
      { h: '6. Sharing', p: ['With our processors under data processing agreements: identity verification, custody, blockchain analytics, payment verification, messaging (email, SMS, push notifications, Telegram), hosting, and, where enabled, an AI service provider [AI PROVIDER] that translates chat messages you ask to translate and reads payment receipts for the automatic checks; it may not use your data to train its models [CONFIRM IN CONTRACT]. With your counterparty as described above. With authorities where legally required.'] },
      { h: '7. Retention and security', p: ['Verification and transaction records are kept for [5–10] years after account closure as required by AML law; other data for as long as needed for the purpose. Personal data and payment details are encrypted at field level; access is role-based and audited.'] },
      { h: '8. Your rights', p: ['Access, rectification, erasure (subject to legal retention), restriction, portability, objection, withdrawal of consent, and complaint to your supervisory authority. Contact [DPO EMAIL].'] },
      { h: '9. International transfers', p: ['Where data leaves your region we use adequacy decisions or standard contractual clauses.'] },
    ],
  },
  risk: {
    title: 'Risk Disclosure', updated: '2026-11-20',
    sections: [
      { h: 'Crypto-assets are high risk', p: ['Prices can fall sharply and you can lose all the money you exchange. Stablecoins can lose their peg. Crypto-assets are generally not covered by deposit guarantee or investor compensation schemes.'] },
      { h: 'Peer-to-peer risks', p: ['You deal with other users. Fiat payments can be reversed, frozen by banks, or come from third parties; reversible payment methods carry chargeback risk. Escrow protects the crypto side only if you follow the trading rules. The insurance fund may compensate approved bank-freeze claims within its limits but is not a guarantee.'] },
      { h: 'Automatic checks are not a guarantee', p: ['Receipt checks, scam cautions, trust scores and translations help you decide but can be wrong or miss a fake. Always confirm the money is in your account before you release crypto.'] },
      { h: 'Operational risks', p: ['Blockchain networks, custodians and payment providers can fail or be delayed. Sending crypto to a wrong address or network is usually irreversible.'] },
      { h: 'Regulatory and tax', p: ['Rules differ by country and can change; services may be restricted in your country. You are responsible for your taxes.'] },
    ],
  },
  'merchant-rules': {
    title: 'Merchant Rules', updated: '2026-11-20',
    sections: [
      { h: 'Who these rules are for', p: ['Everyone who posts ads on parley ("merchants"). Verified merchants additionally hold a security deposit and follow the merchant program terms shown in the Merchant centre.'] },
      { h: 'Ads', p: ['Ads must show a real price you will honour, real limits and real payment methods in your own name. Do not post duplicate ads to crowd the market. Terms and automatic messages must not ask users to contact you outside parley, pay to other accounts, or pay any extra fee.'] },
      { h: 'Serving orders', p: ['Respond within the payment window, release promptly once the money is in your account, and use break mode or business hours when you are unavailable. Orders cancelled or disputed because of you lower your completion rate and trust score.'] },
      { h: 'Promotion', p: ['Promotion places an ad in labelled Promoted spots; it never changes the price ranking of the main list and is shown only to users whose filters match. Promotion fees are not refundable once started. We may remove promotion from ads that break these rules, without refund.'] },
      { h: 'API access', p: ['API keys are personal, must be kept secret and are rate-limited. Automated pricing must keep ads accurate; repeated stale or misleading prices can lead to suspension of API access.'] },
      { h: 'Enforcement', p: ['Breaking these rules can lead to warnings, removal of ads or promotion, loss of merchant level or badge, forfeiture of rewards, and account suspension. Serious cases are reported to authorities.'] },
    ],
  },
  'delete-account': {
    title: 'Delete your account', updated: '2026-11-18',
    sections: [
      { h: 'How to ask', p: ['In the app or on the website, open Account and choose "Delete account", which brings you here. Email [SUPPORT EMAIL] from the email address on your account with the subject "Delete my account". We confirm we received it within 2 working days and may ask you to verify that the request is yours.'] },
      { h: 'Before we delete', p: ['Finish or cancel your open orders and close your ads. Withdraw any crypto left in your wallet: we cannot delete an account that still holds funds or has an open order or dispute.'] },
      { h: 'What we delete', p: ['Within 30 days we close your account and delete your profile, payment details, chat messages, attachments, push tokens and preferences, and you can no longer sign in.'] },
      { h: 'What we must keep', p: ['Anti-money-laundering law requires us to keep identity verification results and transaction records for [5–10] years after the account is closed. We keep only these records, protected and access-controlled, and delete them when the legal period ends.'] },
    ],
  },
};
