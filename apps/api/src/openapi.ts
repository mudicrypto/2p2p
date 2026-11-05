import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
/** OpenAPI document generated from the shared zod schemas used for validation (spec 10). */
const schemas = new Map<string, ZodTypeAny>();
export function registerSchema(name: string, s: ZodTypeAny) { schemas.set(name, s); }
export function buildOpenApi(routes: Array<{ method: string; path: string; body?: string; query?: string; summary?: string }>) {
  const components: Record<string, unknown> = {};
  for (const [n, s] of schemas) components[n] = zodToJsonSchema(s as any, { target: 'openApi3', $refStrategy: 'none' });
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const p = r.path.replace(/:(\w+)/g, '{$1}');
    (paths[p] ??= {})[r.method.toLowerCase()] = {
      summary: r.summary,
      parameters: [...(p.match(/\{(\w+)\}/g) ?? []).map((x) => ({ name: x.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } })),
        ...(r.method !== 'GET' ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }] : [])],
      requestBody: r.body ? { content: { 'application/json': { schema: { $ref: `#/components/schemas/${r.body}` } } } } : undefined,
      responses: { '200': { description: 'OK' } },
      security: p.startsWith('/v1/merchant/') ? [{ merchantKey: [], merchantTimestamp: [], merchantSignature: [] }] : undefined,
    };
  }
  const securitySchemes = {
    merchantKey: { type: 'apiKey', in: 'header', name: 'X-P2P-Key' },
    merchantTimestamp: { type: 'apiKey', in: 'header', name: 'X-P2P-Timestamp', description: 'Unix time in ms; must be within 30s' },
    merchantSignature: { type: 'apiKey', in: 'header', name: 'X-P2P-Signature', description: 'hex HMAC-SHA256(secret, `${timestamp}\\n${METHOD}\\n${path+query}\\n${rawBody}`); single use. See docs/merchant-api.md' },
  };
  return { openapi: '3.0.3', info: { title: 'P2P Exchange API', version: '1.0.0' }, servers: [{ url: '/v1' }], paths, components: { schemas: components, securitySchemes } };
}
