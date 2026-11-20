// Launch-day traffic mix: many people browsing the market, a steady stream of orders.
//   browse: ramps to BROWSERS virtual users (default 300), each loading the order book, a filtered book,
//           the price chart and a trader profile with think time — what the Trade page does.
//   trade:  ORDER_RATE new orders per second (default 5) by distinct buyers (fixtures from loadtest/setup.mjs).
// Run: k6 run -e API=http://localhost:4000 loadtest/launch.k6.js
// Read-only against a live server: k6 run -e API=https://<site> -e READ_ONLY=1 -e BROWSERS=100 loadtest/launch.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const READ_ONLY = __ENV.READ_ONLY === '1';
const fx = READ_ONLY ? { tokens: [], adIds: [] } : JSON.parse(open('./fixtures.json'));
const BROWSERS = Number(__ENV.BROWSERS || 300);
const ORDER_RATE = Number(__ENV.ORDER_RATE || 5);
const DURATION = __ENV.DURATION || '3m';

const scenarios = {
  browse: { executor: 'ramping-vus', exec: 'browse', startVUs: 0, stages: [{ duration: '30s', target: BROWSERS }, { duration: DURATION, target: BROWSERS }, { duration: '15s', target: 0 }] },
};
if (!READ_ONLY) scenarios.trade = { executor: 'constant-arrival-rate', exec: 'trade', rate: ORDER_RATE, timeUnit: '1s', duration: DURATION, startTime: '30s', preAllocatedVUs: 50, maxVUs: 500 };

export const options = {
  scenarios,
  thresholds: {
    'http_req_duration{name:book}': ['p(95)<400'],
    'http_req_duration{name:book_filtered}': ['p(95)<500'],
    'http_req_duration{name:history}': ['p(95)<500'],
    'http_req_duration{name:profile}': ['p(95)<500'],
    ...(READ_ONLY ? {} : { 'http_req_duration{name:create_order}': ['p(95)<500'] }),
    checks: ['rate>0.99'],
  },
};

const FIATS = ['EUR', 'USD'];
export function browse() {
  const fiat = FIATS[exec.vu.idInTest % FIATS.length];
  const r1 = http.get(`${__ENV.API}/v1/ads?side=buy&asset=USDT&fiat=${fiat}&limit=30`, { tags: { name: 'book' } });
  check(r1, { 'book ok': (x) => x.status === 200 });
  sleep(1 + Math.random() * 2);
  const r2 = http.get(`${__ENV.API}/v1/ads?side=buy&asset=USDT&fiat=${fiat}&limit=30&onlineOnly=true&paymentType=SEPA`, { tags: { name: 'book_filtered' } });
  check(r2, { 'filtered ok': (x) => x.status === 200 });
  const r3 = http.get(`${__ENV.API}/v1/market/history?asset=USDT&fiat=${fiat}&hours=24`, { tags: { name: 'history' } });
  check(r3, { 'history ok': (x) => x.status === 200 });
  const items = r1.status === 200 ? r1.json('items') : [];
  if (items && items.length) {
    const ad = items[Math.floor(Math.random() * items.length)];
    const r4 = http.get(`${__ENV.API}/v1/users/${ad.advertiser.id}/profile`, { tags: { name: 'profile' } });
    check(r4, { 'profile ok': (x) => x.status === 200 });
  }
  sleep(2 + Math.random() * 4);
}

export function trade() {
  const i = exec.scenario.iterationInTest;
  if (i >= fx.tokens.length) return;
  const r = http.post(`${__ENV.API}/v1/orders`, JSON.stringify({ adId: fx.adIds[i % fx.adIds.length], cryptoAmount: '10' }), {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fx.tokens[i]}`, 'idempotency-key': `launch-${Date.now()}-${i}`, 'x-device-fingerprint': `launch-dev-${i}` },
    tags: { name: 'create_order' },
  });
  check(r, { 'order created': (x) => x.status === 201 });
}
