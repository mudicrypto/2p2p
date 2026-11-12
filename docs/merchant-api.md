# Merchant API

The Merchant API is for verified merchants who want to run ads and settle trades from their own software. Every request is signed with HMAC. The OpenAPI document at `GET /v1/openapi.json` lists every route; this page explains the parts the spec alone doesn't cover. A ready-made TypeScript client and auto-pricing bot are in `packages/merchant-sdk`.

## 1. Getting access

1. **Apply:** `POST /v1/merchant-program/apply` (session auth, KYC tier 2 or higher).
2. **Lock the security deposit:** `POST /v1/merchant-program/deposit` with `{ asset, amount, totp }`. The default minimum is $5,000 equivalent, configured as `merchants.minDepositUsdCents`. The deposit moves from your available balance to a `security_deposit` ledger account.
3. **Complete level-3 KYC** (video call). Compliance then approves you. You only count as tier 3 for merchant purposes once the deposit is locked.
4. **Create an API key:** `POST /v1/merchant-program/api-keys` with `{ scopes, totp }`. The response is `{ keyId, secret, scopes }`, and **the secret is shown only once**. It is stored envelope-encrypted.
5. **Revoke a key:** `POST /v1/merchant-program/api-keys/{keyId}/revoke`.

| Scope | Allows |
|---|---|
| `ads:read` | `GET /merchant/book`, `GET /merchant/ads` |
| `ads:write` | create and bulk-create ads, bulk update (price / margin / status) |
| `orders:read` | `GET /merchant/orders`, `GET /merchant/orders/{id}` |
| `orders:write` | `POST /merchant/orders/{id}/paid` (when you are the buyer) |
| `orders:release` | `POST /merchant/orders/{id}/release` (when you are the seller) |

Grant each key only the scopes it needs. A release key moves funds: a signed request with an `orders:release` key replaces the TOTP re-prompt that the web app asks for.

## 2. Signing requests

Send these headers on every request:

| Header | Value |
|---|---|
| `X-P2P-Key` | your `keyId` |
| `X-P2P-Timestamp` | current Unix time in **milliseconds**; must be within ±30 s of server time |
| `X-P2P-Signature` | lowercase hex `HMAC-SHA256(secret, canonical)` |
| `Idempotency-Key` | required on every POST/PATCH (see §4) |

The canonical string is four fields joined by `\n`:

```
canonical = timestamp + "\n" + METHOD + "\n" + path_with_query + "\n" + raw_body
```

- `METHOD` is upper case.
- `path_with_query` is exactly as sent, e.g. `/v1/merchant/orders?status=PAID`.
- `raw_body` is the exact bytes you send. Use an empty string for GET.

**Each signature can be used once.** A replayed signature is rejected even inside the 30 s window, so a retry must be signed again with a fresh timestamp (the SDK does this for you).

**Worked example.** With secret `S3cr3t-example-only`, timestamp `1762380000000` and this request:

```
PATCH /v1/merchant/ads/bulk
{"ads":[{"id":"8f1c2a9e-3b4d-4c5e-9f60-7a8b9c0d1e2f","price":"0.9491"}]}
```

the canonical string is:

```
1762380000000
PATCH
/v1/merchant/ads/bulk
{"ads":[{"id":"8f1c2a9e-3b4d-4c5e-9f60-7a8b9c0d1e2f","price":"0.9491"}]}
```

and the signature is `9cda43754f7917ccfcfb28a02a7c3d3a9c224815db8d7b0776b26bff6f0aaeb5`.

```ts
import { createHmac } from 'node:crypto';
const sig = createHmac('sha256', secret).update(`${ts}\n${method}\n${path}\n${body}`).digest('hex');
```

## 3. Endpoints

All amounts and prices are **decimal strings**, never JSON numbers. Prices are fiat per one whole crypto unit.

### Order book: `GET /v1/merchant/book?side=buy|sell&asset=USDT&fiat=EUR[&paymentType=SEPA&amount=100&limit=100]`

`side` is the taker's side: `side=buy` lists SELL ads, cheapest first.

```json
{ "items": [ { "id": "…", "side": "sell", "asset": "USDT", "fiat": "EUR", "priceType": "fixed", "price": "0.95",
  "minAmount": "10", "maxAmount": "5000", "remainingAmount": "500", "paymentTypes": ["SEPA"], "advertiser": { "id": "…", "verifiedBadge": true } } ],
  "nextCursor": null }
```

### Your ads: `GET /v1/merchant/ads`

Returns an array of ad objects with the same shape as book items.

### Create an ad: `POST /v1/merchant/ads`

The body uses the same schema as `POST /v1/ads` (`CreateAd` in OpenAPI):

```json
{ "side": "sell", "asset": "USDT", "fiat": "EUR", "priceType": "fixed", "price": "0.99", "minAmount": "10", "maxAmount": "5000",
  "totalAmount": "1000", "paymentMethodIds": ["<your payment method id>"], "paymentWindowMin": 15, "terms": "", "minCounterpartyTier": 0 }
```

### Bulk create: `POST /v1/merchant/ads/bulk`

Send `{ "ads": [CreateAd, …] }` with at most 50 ads. Each ad is created in its own transaction, so one invalid ad doesn't block the others.

```json
{ "results": [ { "ok": true, "ad": { "id": "…" } }, { "ok": false, "error": "VALIDATION", "message": "…" } ] }
```

### Bulk update: `PATCH /v1/merchant/ads/bulk`

Send `{ "ads": [ { "id": "…", "price": "0.9491" }, { "id": "…", "marginBps": -25 }, { "id": "…", "status": "paused" } ] }` with at most 100 items. Use `price` for fixed ads and `marginBps` for floating ads. `status` is one of `active`, `paused` or `closed`.

The response is `{ "results": [ { "id": "…", "ok": true, "ad": { … } } ] }`.

### Orders: `GET /v1/merchant/orders[?status=AWAITING_PAYMENT,PAID]` and `GET /v1/merchant/orders/{id}`

```json
{ "id": "…", "role": "seller", "status": "PAID", "asset": "USDT", "fiat": "EUR", "cryptoAmount": "100", "fiatAmount": "94.91",
  "price": "0.9491", "fee": "0.08", "feePayer": "seller", "referenceCode": "P2PAB12CD34", "expiresAt": "…", "paidAt": "…", "events": [ … ] }
```

### Mark paid: `POST /v1/merchant/orders/{id}/paid`

Use this when you are the buyer and have sent the fiat. Include the order's `referenceCode` in the payment comment.

### Release: `POST /v1/merchant/orders/{id}/release`

Use this when you are the seller, and **only after** the fiat has arrived from an account in the buyer's name. Releasing moves the escrowed crypto to the buyer and can't be undone.

## 4. Idempotency, errors and limits

**Idempotency.** Every POST or PATCH needs an `Idempotency-Key` header of up to 200 characters, unique per logical operation. If you retry with the same key and the same body, you get the stored response back with the header `Idempotent-Replayed: true`. Reusing a key with a different body returns `422 IDEMPOTENCY_MISMATCH`. The SDK reuses the key across its retries.

**Errors** come back as `{ "error": CODE, "message": "…" }`:

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION` |
| 401 | `UNAUTHORIZED`: missing, stale, bad or replayed signature, or a revoked key |
| 403 | `FORBIDDEN` (missing scope, not an approved merchant), `TIER_REQUIRED`, `ACCOUNT_FROZEN`, `RISK_BLOCKED` |
| 404 | `NOT_FOUND` |
| 409 | `ILLEGAL_TRANSITION`, `AD_UNAVAILABLE`, `CONFLICT` |
| 422 | `INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`, `IDEMPOTENCY_MISMATCH` |
| 429 | `RATE_LIMITED` |

**Rate limits** are enforced in Redis per IP and per user. Read endpoints allow 600 requests per minute; every other endpoint uses the default of 300 per minute. Back off exponentially on 429.

## 5. Fees and levels

Takers pay 0% and makers pay 0.1% by default. Approved merchants get lower maker fees by level, which comes from 30-day volume (`merchants.levels`):

| Level | 30-day volume | Maker fee |
|---|---|---|
| 1 | from $0 | 0.08% |
| 2 | from $100k | 0.06% |
| 3 | from $1M | 0.04% |

Levels are recomputed hourly. Fees are charged in crypto at completion.

## 6. Auto-pricing bot

```bash
API_URL=https://api.example.com MERCHANT_KEY_ID=mk_… MERCHANT_SECRET=… STEP_BPS=5 FLOOR_BPS=-100 CEIL_BPS=300 node packages/merchant-sdk/dist/bin.js
```

The bot reprices every fixed-price ad so it stays `STEP_BPS` better than the best competing price:

- for SELL ads, it undercuts the cheapest seller;
- for BUY ads, it outbids the highest buyer.

The new price is clamped between `reference × (1 + FLOOR_BPS)` and `reference × (1 + CEIL_BPS)`. The reference is the median of the competing book unless you pass your own `reference()` function. Use `AutoPricer.runOnce()` for a single pass.
