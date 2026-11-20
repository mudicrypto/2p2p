/** Sentry error reporting. TODO(provider): set SENTRY_DSN. PII is scrubbed before sending. */
import * as Sentry from '@sentry/node';
import { redactPii } from '@p2p/core';
let enabled = false;
export function initSentry() {
  if (!process.env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.05), sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) { delete event.request.cookies; delete event.request.data; if (event.request.headers) { delete event.request.headers.authorization; delete event.request.headers.cookie; } }
      if (event.message) event.message = redactPii(event.message);
      return event;
    },
  });
  enabled = true;
}
export function captureException(e: unknown) { if (enabled) Sentry.captureException(e); }
