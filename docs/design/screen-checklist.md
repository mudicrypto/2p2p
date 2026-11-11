# Screen checklist (web · Telegram · iOS/Android)

| # | Screen | Web | Mobile | API used |
|---|---|---|---|---|
| 1 | App shell: sidebar, ticker bar, search, notifications bell with badge, user menu | ✅ | – | `/ads`, `/notifications`, `/auth/me` |
| 2 | Mobile shell: bottom tabs (Home, P2P, Orders+badge, Wallet, Profile) | ✅ (phone web) | ✅ | `/orders` |
| 3 | Welcome / splash: logo, "Trade Crypto Your Way", Get Started, Sign In | ✅ (home hero) | ✅ | – |
| 4 | Home dashboard: hero, trust strip, total balance card, P2P offers widget, market trend | ✅ | ✅ | `/me/balances`, `/ads` |
| 5 | P2P market: Buy/Sell, assets, currency, payment methods, regions, filter, offers table/cards | ✅ | ✅ | `/ads`, `/fiats`, `/payment-method-types` |
| 6 | Trade sheet / dialog: amounts both ways, limits, payment method, place order | ✅ | ✅ | `/ads/:id`, `POST /orders` |
| 7 | Order detail: status pill, counterparty, payment timer, 4-step stepper, payment instructions, upload receipt, chat, actions | ✅ | ✅ | `/orders/:id`, `/attachments`, `/messages` |
| 8 | Orders list: in progress / all, badges | ✅ | ✅ | `/orders` |
| 9 | Wallet: total balance, Deposit / Withdraw / Transfer / History, my assets | ✅ | ✅ | `/me/balances`, `/wallet/*` |
| 10 | Deposit (QR) · Withdraw (allowlist + 2FA) · Transfer | ✅ | ✅ | `/wallet/*` |
| 11 | Merchant Centre: performance (completion), trading volume, completed orders, My Ads, Analytics, Settings, Support, Create Advertisement | ✅ | ✅ | `/merchant-program/status`, `/me/ads`, `/orders`, `/users/:id/profile` |
| 12 | Create advertisement | ✅ | ✅ (opens web form) | `POST /ads` |
| 13 | Rewards / Invite friends (coming soon) | ✅ | ✅ | – |
| 14 | Help & Support: FAQ, disputes, status, legal | ✅ | ✅ | `/status` |
| 15 | Settings / Profile: verification, security, language, theme, logout | ✅ | ✅ | `/kyc/*`, `/auth/*` |
| 16 | Auth: sign in, sign up, verify email | ✅ | ✅ | `/auth/*` |
| 17 | Notifications | ✅ | ✅ | `/notifications` |
| 18 | Public profile | ✅ | – | `/users/:id/profile` |
| 19 | Corridor, status, legal | ✅ | – | existing |

Acceptance: every screen in dark mode (default) and light mode, phone and desktop, RTL; all existing E2E test ids preserved; no horizontal overflow; all strings in 26 locales.

Verified Nov 2026: web E2E 56/56 (trade flow + every locale on desktop and phone, no horizontal overflow), Telegram E2E 1/1,
mobile unit tests 7/7, `expo export` iOS + Android, screenshot review of every screen (dark, light, RTL, phone), native
APK and iOS simulator builds in CI (`mobile.yml`).
