# KRYPTA design system (source: product mockup, Nov 2026)

> Brand name is temporary. It lives in one place per platform (`packages/ui/src/brand.ts`,
> `apps/mobile/src/brand.ts`, `app.name` in the locale files) so a rename is a one-line change.

## Brand
- **Mark:** gold "K" monogram built from two angled bars plus a separate lower-right leg, on a transparent background or on near-black.
- **Wordmark:** the brand name in uppercase, semibold, letter-spacing 0.06em.
- **Voice:** "Trade Crypto **Your Way**" (the second line is set in gold), "Fast. Secure. Global."

## Colour tokens (dark theme is the default; a light theme is kept for accessibility)
| Token | Dark | Light | Use |
|---|---|---|---|
| `background` | `#07080a` | `#f7f6f2` | page |
| `card` | `#101114` | `#ffffff` | panels, rows |
| `surface` | `#15171b` | `#ffffff` | raised controls |
| `muted` | `#1a1c21` | `#efede6` | inputs, chips, inactive tabs |
| `border` | `#24262c` | `#e4e1d8` | 1px hairlines |
| `foreground` | `#f5f5f4` | `#0b0b0c` | text |
| `muted-foreground` | `#8c8f98` | `#5d606a` | secondary text |
| `primary` (gold) | `#f5b50a` | `#d99a00` | CTAs, active nav, highlights |
| `primary-2` (amber) | `#ffcf4a` | `#f0b400` | gradient end, hover |
| `primary-foreground` | `#111111` | `#111111` | text on gold |
| `buy` | `#18c27a` | `#0e9f62` | prices, buy, positive change |
| `sell` | `#f6465d` | `#d83148` | sell, negative change, alerts |
| `warn` | `#f0a020` | `#c47f00` | timers, pending |
| `info` | `#3b82f6` | `#2563eb` | verified badges |

Gradients: `gold` = `#ffcf4a → #f5b50a → #e09a00` (135°); `glow` = a radial gold at 18% opacity for hero and balance cards.

## Type
Inter Variable. Display 44–56/1.05 extrabold (hero), H1 28–32 bold, H2 20–22 bold, body 14–15, small 12–13, tiny 11. Numbers use tabular figures.

## Shape and spacing
Radius: 10 (controls) · 14 (buttons) · 18–20 (cards) · 28 (phone hero cards) · pill (chips).
Spacing on a 4px grid; cards have 20–24px padding on desktop and 16px on phones. Borders are 1px `border`, with no heavy shadows except the gold glow on primary CTAs.

## Components
- **Buttons:** primary (solid gold, dark text), outline (border, light text), ghost, buy (green), sell (red), sm/md/lg.
- **Segmented control:** Buy (gold when active) / Sell.
- **Pills:** asset chips with coin icon; filter selects (currency, payment methods, regions, filter).
- **Price ticker item:** coin icon, symbol, indicative price, change and sparkline (only when the data exists).
- **Offer row:** avatar, name, verified tick, completion and order count, green price + fiat, available range, payment-method icons, gold Buy button.
- **Balance card:** label, eye toggle, big number, actions (Deposit primary, Withdraw, Trade).
- **Stepper (order):** 4 steps (Order Created → Awaiting Payment → Verify Payment → Release Crypto), with green check circles for completed steps.
- **Timer:** gold ring icon with mm:ss.
- **Bottom tab bar (mobile):** Home · P2P · Orders (badge) · Wallet · Profile, with gold for the active tab.
- **Sidebar (desktop):** Home, P2P Trade, Wallet, Orders (badge), Merchant Centre, Rewards, Help & Support, Settings, then the invite card.

## Data honesty rules (frontend only, backend unchanged)
- Prices in the ticker, balance valuation and "Market Trend" are **indicative P2P prices** from the public order book (`GET /v1/ads`). There is no price-history endpoint, so 24h % change and sparklines are not shown as real data.
- Only assets the backend supports appear (USDT, BTC, ETH). USDC is omitted.
- Rewards and referrals have no API, so they are shown as "coming soon" with no fake numbers.
