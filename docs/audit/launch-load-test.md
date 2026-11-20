# Launch load test (2026-11-20)

Script: `loadtest/launch.k6.js` (k6). Traffic mix per simulated user, like the Trade page: load the order book,
think 1–3 s, load a filtered book and the 24 h price chart, open a trader profile, think 2–6 s. In parallel a steady
stream of new orders by distinct buyers (each order locks escrow in the ledger). Seed: 1,200 buyers, 100 sellers.

## Results — API alone, 2 worker processes (same as the 2-CPU test server), local machine

| Scenario | Requests/s | Book p95 | Filtered book p95 | Profile p95 | Create order p95 | Errors |
|---|---|---|---|---|---|---|
| Launch day: 300 people browsing + 5 orders/s | 152 | 17 ms | 15 ms | 7 ms | 98 ms | 0 % |
| Stress: 1,500 people browsing + 9 orders/s | 739 | 26 ms | 20 ms | 22 ms | 108 ms | 0 % |

Every threshold passed (book < 400 ms, orders < 500 ms at p95, > 99 % success). The order book is cached in
Redis for 2 s and invalidated on every change, so browsing load barely touches the database.

## Live test server (72-56-69-5.sslip.io, 2 CPU / 4 GB, via HTTPS)

A read-only run from one machine was cut off by the per-IP rate limit (300 requests/minute per address, HTTP 429)
after the first minute — the flood protection works. Requests that were allowed answered in ~115 ms p95, almost all
of it network distance between the test machine and the Netherlands.

## What this means for launch

- One 2-CPU server comfortably handles a launch of a few thousand daily users (hundreds online at once).
- Watch: CPU and memory on the health page (`/_ops/<token>/health.txt`); upgrade to 4 CPU / 8 GB before
  marketing pushes, and move Postgres to a managed database when daily active users pass ~10,000.
- Rate limit: 300/min per IP is right for a single user but can be tight when many users share one mobile-carrier
  address. Raise `RATE_LIMIT_PER_MIN` (e.g. 1200) on launch day if users report "too many requests".

Re-run: `node loadtest/setup.mjs` (BUYERS/SELLERS env) then
`k6 run -e API=http://localhost:4000 -e BROWSERS=300 -e ORDER_RATE=5 loadtest/launch.k6.js`.
