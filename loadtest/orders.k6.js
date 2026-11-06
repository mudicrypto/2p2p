// k6 load test (CI): 5,000 order creations, each by a distinct buyer, with up to 5,000 in flight.
// Run: k6 run -e API=http://localhost:4000 loadtest/orders.k6.js   (fixtures from loadtest/setup.mjs)
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
const fx = JSON.parse(open('./fixtures.json'));
export const options = {
  // Open model: RATE orders/s until all fixtures are used; every order stays open (60-min window) -> 5,000 concurrent orders.
  scenarios: { orders: { executor: 'constant-arrival-rate', rate: Number(__ENV.RATE || 60), timeUnit: '1s', duration: `${Math.ceil(fx.tokens.length / Number(__ENV.RATE || 60))}s`, preAllocatedVUs: 200, maxVUs: 2000 } },
  thresholds: { 'http_req_duration{name:create_order}': ['p(95)<300'], 'checks': ['rate>0.99'] },
};
export default function () {
  const i = exec.scenario.iterationInTest;
  const r = http.post(`${__ENV.API}/v1/orders`, JSON.stringify({ adId: fx.adIds[i % fx.adIds.length], cryptoAmount: '10' }), {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fx.tokens[i]}`, 'idempotency-key': `lt-${i}`, 'x-device-fingerprint': `lt-dev-${i}` },
    tags: { name: 'create_order' },
  });
  check(r, { 'order created': (x) => x.status === 201 });
}
