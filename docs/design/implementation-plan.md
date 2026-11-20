# parley implementation notes

No backend changes. All screens use the existing REST API and realtime events.

1. Tokens: `packages/ui/src/theme.css` (web, Telegram, admin) and `apps/mobile/src/theme.ts`.
2. Kit: `packages/ui/src/index.tsx` (web) and `apps/mobile/src/ui.tsx` (Hero, Big, Pill, Segmented, Chip, Badge).
3. Shell: `apps/web/components/nav.tsx`; mobile `app/(tabs)/_layout.tsx` (pill tab bar) and `src/topbar.tsx`.
4. Screens: web `components/trade-home.tsx`, `app/[locale]/orders/[id]`, `orders`, `wallet`, `profile/[id]`, auth;
   mobile `app/(tabs)/index|orders|wallet`, `app/orders/[id]`, `app/profile/[id]`, `welcome`, `signup`, `login`.
5. Shared order wording: `apps/web/components/order-state.ts` and `apps/mobile/src/format.ts` (unit tested).
6. Strings: new `ui.*` keys translated in all 26 locales.
