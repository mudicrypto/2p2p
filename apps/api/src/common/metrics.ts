import client from 'prom-client';
import type { DomainEvent, EventSink } from '@p2p/core';

/** Prometheus metrics (scraped at /metrics). */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'HTTP request latency', labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5], registers: [registry],
});
export const domainEvents = new client.Counter({ name: 'domain_events_total', help: 'Domain events by type', labelNames: ['type', 'status'], registers: [registry] });
export const invariantOk = new client.Gauge({ name: 'ledger_invariant_ok', help: '1 if the last ledger invariant check passed', registers: [registry] });
export const withdrawalsPaused = new client.Gauge({ name: 'withdrawals_paused', help: '1 if withdrawals are paused', registers: [registry] });
export const bookCacheHits = new client.Counter({ name: 'order_book_cache_total', help: 'Order book cache lookups', labelNames: ['result'], registers: [registry] });

export function httpMetricsMiddleware(req: any, res: any, next: () => void) {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path ?? 'unmatched', status: String(res.statusCode) }));
  next();
}
export const metricsSink: EventSink = { publish: (e: DomainEvent) => { domainEvents.inc({ type: e.type, status: String(e.payload?.status ?? '') }); } };
