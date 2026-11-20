// k6 load test (CI): 5,000 order creations, each by a distinct buyer, with up to 5,000 in flight.
// Run: k6 run -e API=http://localhost:4000 loadtest/orders.k6.js   (fixtures from loadtest/setup.mjs)
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
const fx = JSON.parse(open('./fixtures.json'));
const RATE = Number(__ENV.RATE || 60);
const warm = fx.warmup ?? [];
const warmSecs = Math.ceil(warm.length / RATE);
export const options = {
  // Warm-up first: a few seconds of real orders from separate buyers so JIT, DB pools and every API worker are warm.
  // It is not measured: the threshold only looks at create_order from the main scenario.
  // Then the open model: RATE orders/s until all fixtures are used; every order stays open (60-min window) -> 5,000 concurrent orders.
  scenarios: {
    ...(warm.length ? { warmup: { executor: 'constant-arrival-rate', exec: 'warmup', rate: RATE, timeUnit: '1s', duration: `${warmSecs}s`, preAllocatedVUs: 50, maxVUs: 500 } } : {}),
    orders: { executor: 'constant-arrival-rate', startTime: warm.length ? `${warmSecs + 2}s` : '0s', rate: RATE, timeUnit: '1s', duration: `${Math.ceil(fx.tokens.length / RATE)}s`, preAllocatedVUs: 200, maxVUs: 2000 },
  },
  thresholds: { 'http_req_duration{name:create_order}': ['p(95)<300'], 'checks{scenario:orders}': ['rate>0.99'] },
};
const order = (token, i, key, name) => http.post(`${__ENV.API}/v1/orders`, JSON.stringify({ adId: fx.adIds[i % fx.adIds.length], cryptoAmount: '10' }), {
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': `${key}-${i}`, 'x-device-fingerprint': `${key}-dev-${i}` },
  tags: { name },
});
export function warmup() {
  const i = exec.scenario.iterationInTest;
  if (i < warm.length) order(warm[i], i, 'lt-warm', 'warmup_order');
}
export default function () {
  const i = exec.scenario.iterationInTest;
  // constant-arrival-rate rounds the duration up and can schedule a few extra iterations: no fixture, no request.
  if (i >= fx.tokens.length) return;
  const r = order(fx.tokens[i], i, 'lt', 'create_order');
  check(r, { 'order created': (x) => x.status === 201 });
}
