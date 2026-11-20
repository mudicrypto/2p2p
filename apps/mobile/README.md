# P2P Exchange — iOS & Android app

Expo SDK 58 / React Native 0.88, expo-router, same API, design language and 26 languages as the web app.

**Screens:** Market (buy/sell, assets, currencies, live offers), trade sheet (two-way fiat ⇄ crypto, float-free maths),
order (progress, countdown, payee details with copy, mark paid / release with biometric + 2FA, feedback, chat),
My orders, Wallet (balances, deposit with QR, withdraw with address allowlist, history, test-mode faucet),
Account (verification levels, security, language, theme), notifications, sign up / log in.
Biometric app lock, push notifications, deep links (`p2p://orders/{id}`, universal links), RTL locales.

## Run locally
```bash
pnpm install
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000 pnpm --filter @p2p/mobile start   # scan the QR with Expo Go / dev client
pnpm --filter @p2p/mobile test        # pure logic tests (deep links, lock, decimal maths, i18n)
```

## Builds
* **CI (`.github/workflows/mobile.yml`)** builds on every change: a release **Android APK** and an unsigned
  **iOS simulator app**, uploaded as workflow artifacts. Native projects are generated with `expo prebuild`
  (not committed).
* **Store builds** use EAS (`eas.json`): `eas build -p android --profile production` /
  `eas build -p ios --profile production`, then `eas submit`. These need accounts only you can create:
  - Expo account + `eas init` (adds `extra.eas.projectId`, also used for push tokens) — `TODO(provider)`
  - Apple Developer Program team (bundle id `com.example.p2pexchange` → change to yours) — `TODO(provider)`
  - Google Play Console app + service-account JSON for `eas submit` — `TODO(provider)`
  - Replace `app.example.com` / `api.example.com` in `app.json` / `eas.json` with your domains and host
    `apple-app-site-association` + `assetlinks.json` for universal links.
