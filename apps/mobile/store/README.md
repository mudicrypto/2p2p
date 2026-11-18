# Publishing parley on Google Play

What is in this folder:

| File | Use in Play Console |
|---|---|
| `icon-512.png` | Main store listing → App icon (512 × 512) |
| `feature-graphic.png` | Main store listing → Feature graphic (1024 × 500) |
| `screenshots/phone-*.jpg` | Main store listing → Phone screenshots (1080 × 2160) |
| `listing.md` | Store texts, Data safety answers, content rating notes |

The screenshots were taken from the app's own screens running on demo data in test mode.

## 1. Create the developer account (you)

1. Decide **personal or organization** account.
   - **Organization** is the right choice for a crypto exchange: Google expects a registered business for financial apps, and organization accounts skip the "12 testers for 14 days" rule that new personal accounts must pass before going to production.
   - An organization account needs a free **D-U-N-S number** for your company (request it at dnb.com, takes from a few days up to about 30 days), a company website, and a company email and phone.
2. Go to **play.google.com/console/signup**, sign in with the Google account that will own the app (use a company account, not a personal Gmail you might lose).
3. Choose the account type, accept the Developer Distribution Agreement.
4. **Pay the one-time US$25 registration fee** with a credit or debit card in the Google Payments form.
5. **Verify your identity**: legal name and address exactly as on your ID (personal) or company registration (organization), a government ID upload, and for organizations the D-U-N-S number.
6. **Verify contact details**: email and phone (code by SMS).
7. **Verify you have an Android device**: install the Play Console app on an Android phone and sign in with the same account. Google asks for this on new accounts.
8. Wait for approval (usually a few days; can take longer for organizations).

## 2. Decide the app's package name (one-time, cannot be changed)

The app currently uses the placeholder `com.example.p2pexchange`. Google Play rejects `com.example.*`, and a package name can never be changed after the first upload. Use your domain reversed, for example `app.parley` or `com.getparley.app`, then update `apps/mobile/app.json` (`android.package` and `ios.bundleIdentifier`).

## 3. Create the upload key (you, on your own computer)

Play App Signing keeps the real signing key at Google; you only hold an **upload key**.

```bash
keytool -genkeypair -v -keystore parley-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 parley-upload.jks > parley-upload.jks.b64     # macOS: base64 -i parley-upload.jks
```

`keytool` comes with Java (also bundled with Android Studio). Keep `parley-upload.jks` and its passwords in a password manager: never commit them and never paste them into chat.

Add these in GitHub → repository **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | contents of `parley-upload.jks.b64` |
| `ANDROID_UPLOAD_STORE_PASSWORD` | keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | `upload` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | key password |

and these **Variables** (same page, Variables tab):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | your API address, e.g. `https://api.parley.app` |
| `EXPO_PUBLIC_WEB_URL` | your website, e.g. `https://parley.app` |

The next "Mobile builds" run then produces **`parley-android-play-bundle`** (a signed `.aab`) next to the test APK. The build fails on purpose if the bundle is still debug-signed. `versionCode` is set from the run number, so every build is newer than the last.

## 4. Create the app in Play Console

1. **Create app** → name `parley`, default language, **App**, **Free**, accept the declarations.
2. **Set up your app** checklist:
   - **Privacy policy URL**: `https://<your-site>/en/legal/privacy` (fill in the `[BRACKETS]` with your lawyer first).
   - **App access**: give reviewers a test login (an account in test mode with test funds) and explain where 2FA codes come from.
   - **Ads**: No.
   - **Content rating**: questionnaire, category "All other app types"; answer yes to user-to-user chat and real-money transactions (see `listing.md`).
   - **Target audience**: 18+ only.
   - **Data safety**: use the answers in `listing.md`.
   - **Financial features**: declare **cryptocurrency exchange / wallet** and P2P trading. Google asks for proof of registration or licence for each country you target. Only select countries where you have it.
   - **Government apps / news / health**: No.
   - **Account deletion**: URL `https://<your-site>/en/legal/delete-account`; the app also links to it from Account → Delete account.
3. **Main store listing**: texts from `listing.md`, the icon, feature graphic and screenshots from this folder.

## 5. Upload and test

1. **Testing → Internal testing → Create release**, upload the `.aab` from the CI artifact, add yourself and colleagues as testers (up to 100 by email). It is live for them within minutes.
2. **Closed testing**: invite a wider group. A new personal account must run a closed test with at least 12 testers for 14 days before it can request production access.
3. **Production**: choose countries (only licensed ones), submit for review. First reviews usually take from a few days up to about a week; financial apps can take longer.

## Optional: automatic uploads

Create a Google Cloud service account with access to your Play Console app, download its JSON key, and store it as a secret. `eas.json` is already set up to submit to the internal track, and the CI can be extended to upload each bundle automatically.
