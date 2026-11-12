# parley design system (source: P2P_Exchange_UI.pdf, Nov 2026)

Brand: **parley**, lower-case wordmark. Promise: "Trade with people. Protected by escrow."
The name lives in one place per platform (`BRAND` in `packages/ui/src/index.tsx` and
`apps/mobile/src/theme.ts`, `app.name` in the locale files, `name` in `apps/mobile/app.json`).

## Principles
- One question per screen, answered with a huge numeral (amount to pay, time left, money to check for, balance).
- Warm neutral surfaces, one sand accent, solid pills. No gradients except the soft radial glow behind hero cards.
- Only three primary destinations: **Trade · Orders · Wallet**. Everything else sits behind the profile button.
- Honest data only: every number is from the API. Where the design shows data the API does not have
  (price history, bond amount, "% over market"), the screen shows a truthful substitute
  ("Best of N", "Merchant bond" vs "Escrow", average release time, "New trader").

## Colour tokens
| Token | Dark | Light | Use |
|---|---|---|---|
| `background` | `#111214` | `#ebe9e4` | page |
| `card` | `#1c1d20` | `#ffffff` | cards (radius 28) |
| `muted` | `#2a2b2f` | `#ecebe8` | inputs, chips, soft buttons |
| `border` | `#2e2f33` | `#e6e3dd` | hairlines between rows |
| `foreground` | `#f4f2ee` | `#1a1815` | text |
| `muted-foreground` | `#a3a19c` | `#6f6c66` | secondary text |
| `primary` (sand) | `#e2c38a` | `#e2c38a` | main CTA, escrow pills, active step |
| `ink` / `ink-foreground` | `#f3f1ec` / `#161513` | `#1a1815` / `#ffffff` | active nav pill, segmented control, chat bubbles |
| `buy` (sage) | `#9fd49a` | `#1f6b33` | done steps, positive |
| `sell` (coral) | `#ec8670` | `#e0705a` | dispute, sell CTA, timer under 2 min |
| `info` (periwinkle) | `#a9bdf5` | `#3b5bc4` | "Confirm payment", seller check hero |
| `glow` | `rgb(150 98 42 / .55)` | `rgb(250 214 186 / .85)` | radial glow behind hero numerals |

## Type
Inter (web, iOS), Roboto/system (Android). Display numerals 800 weight, tracking −0.045em, tabular.
Titles 700, tracking −0.03em. Body 15–17px.

## Components
Buttons and pills are fully rounded (sand primary, ink, soft, coral). Cards 28px radius, no shadow.
Badges are solid pills (sage success, sand warning, coral danger, periwinkle info).
Phone navigation: top bar (profile · wordmark · light/dark) and a floating pill tab bar.
Desktop: left column with a primary card (wordmark, Trade/Orders/Wallet, theme toggle) and a secondary card.
