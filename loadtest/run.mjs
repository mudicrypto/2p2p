// Node equivalent of orders.k6.js (used where the k6 binary is unavailable). Same requests, same thresholds.
import { readFileSync } from 'node:fs';
const API = process.env.API ?? 'http://localhost:4000';
const VUS = Number(process.env.VUS ?? 500);
const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const lat = []; let ok = 0, fail = 0; const errors = {};
let next = 0;
const t0 = performance.now();
async function vu() {
  for (;;) {
    const i = next++;
    if (i >= fx.tokens.length) return;
    const s = performance.now();
    const r = await fetch(`${API}/v1/orders`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fx.tokens[i]}`, 'idempotency-key': `lt-${i}`, 'x-device-fingerprint': `lt-dev-${i}` }, body: JSON.stringify({ adId: fx.adIds[i % fx.adIds.length], cryptoAmount: '10' }) }).catch((e) => ({ status: 0, text: async () => String(e) }));
    lat.push(performance.now() - s);
    if (r.status === 201) ok++; else { fail++; const t = (await r.text()).slice(0, 80); errors[t] = (errors[t] ?? 0) + 1; }
    if (r.status === 201) await r.text();
  }
}
const RATE = Number(process.env.RATE ?? 0);
async function one(i) {
  const s = performance.now();
  const r = await fetch(`${API}/v1/orders`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fx.tokens[i]}`, 'idempotency-key': `lt-${i}`, 'x-device-fingerprint': `lt-dev-${i}` }, body: JSON.stringify({ adId: fx.adIds[i % fx.adIds.length], cryptoAmount: '10' }) }).catch((e) => ({ status: 0, text: async () => String(e) }));
  lat.push(performance.now() - s);
  const t = await r.text();
  if (r.status === 201) ok++; else { fail++; errors[t.slice(0, 80)] = (errors[t.slice(0, 80)] ?? 0) + 1; }
}
if (RATE > 0) {
  // Open model (k6 constant-arrival-rate): requests start on schedule regardless of completions.
  const inflight = [];
  for (let i = 0; i < fx.tokens.length; i++) {
    const due = t0 + (i * 1000) / RATE;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    inflight.push(one(i));
  }
  await Promise.all(inflight);
} else await Promise.all(Array.from({ length: VUS }, vu));
const secs = (performance.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))].toFixed(1);
const res = { requests: lat.length, ok, fail, rps: (lat.length / secs).toFixed(0), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: lat.at(-1).toFixed(1), errors };
console.log(JSON.stringify(res, null, 1));
if (Number(res.p95) >= 300 || ok / lat.length < 0.99) process.exitCode = 1;
