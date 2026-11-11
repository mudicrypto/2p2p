# KRYPTA frontend — implementation plan

## Current architecture (inspected)
- **Web** `apps/web`: Next.js 15 App Router, Tailwind v4, routes under `app/[locale]/…`, client components calling `/v1` through `lib/api.ts` (cookie and CSRF auth, idempotency keys), Socket.IO realtime, `lib/i18n.tsx` (26 locales from `packages/i18n`), shared components from `packages/ui` (theme tokens in `theme.css`).
- **Telegram** `apps/tg`: re-exports the web pages, adds its own gate and tab bar.
- **Admin** `apps/admin`: separate Next app; it shares `theme.css`.
- **iOS/Android** `apps/mobile`: Expo SDK 58, expo-router (tabs plus modal stack), `src/api.ts` (bearer auth), `src/ui.tsx` kit, `src/theme.ts` tokens, static locale bundle. Native builds run in CI (`.github/workflows/mobile.yml`: APK and iOS simulator app).
- **Backend** `apps/api`: **not modified** in this work.

## Phases
0. Docs: design system, screen checklist, this plan; centralise the brand name.
1. Tokens: gold-on-black palette, K monogram, button styles, all in `packages/ui` and `apps/mobile/src/theme.ts`.
2. Web shell: desktop sidebar, ticker bar fed by the indicative order-book prices, search, notifications, user menu, phone bottom tabs.
3. Web screens: Home dashboard, P2P, trade, order detail (4-step stepper, upload receipt), orders, wallet, Merchant Centre, Rewards, Help & Support, Settings, auth; Telegram inherits them.
4. Mobile: welcome screen, Home, P2P, Orders, Wallet, Profile tabs, Merchant Centre, order screen, all in the gold theme.
5. i18n for all new strings, then tests: web E2E (all locales on desktop and phone), Telegram E2E, mobile unit tests, `expo export`, screenshot review, CI native builds.
