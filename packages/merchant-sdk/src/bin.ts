#!/usr/bin/env node
/** Auto-pricing bot CLI. Env: API_URL, MERCHANT_KEY_ID, MERCHANT_SECRET, [STEP_BPS, FLOOR_BPS, CEIL_BPS, INTERVAL_MS]. */
import { MerchantClient } from './client';
import { AutoPricer } from './pricer';

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`missing env ${name}`); process.exit(2); }
  return v;
}
const client = new MerchantClient({ apiUrl: env('API_URL'), keyId: env('MERCHANT_KEY_ID'), secret: env('MERCHANT_SECRET') });
const bot = new AutoPricer(client, {
  stepBps: Number(process.env.STEP_BPS ?? 5), floorBps: Number(process.env.FLOOR_BPS ?? -100), ceilBps: Number(process.env.CEIL_BPS ?? 300),
  intervalMs: Number(process.env.INTERVAL_MS ?? 15_000), log: (m) => console.log(new Date().toISOString(), m),
});
bot.start();
process.on('SIGINT', () => { bot.stop(); process.exit(0); });
process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
