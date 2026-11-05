/** Deep links: p2p://orders/{id}, https://app.example.com/{locale?}/orders/{id}, p2p://market?asset=&fiat=, notification payloads. */
export type Route = { screen: 'order'; id: string } | { screen: 'market'; asset?: string; fiat?: string } | { screen: 'wallet' } | { screen: 'unknown' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UNIVERSAL_HOSTS = ['app.example.com'];

export function parseDeepLink(raw: string): Route {
  let u: URL;
  try { u = new URL(raw); } catch { return { screen: 'unknown' }; }
  let parts: string[];
  if (u.protocol === 'p2p:') parts = [u.hostname, ...u.pathname.split('/')].filter(Boolean);
  else if (u.protocol === 'https:' && UNIVERSAL_HOSTS.includes(u.hostname)) parts = u.pathname.split('/').filter(Boolean);
  else return { screen: 'unknown' };
  if (parts[0] && /^[a-z]{2}(-[A-Za-z]+)?$/.test(parts[0]) && parts[0] !== 'orders') parts = parts.slice(1); // optional locale prefix
  if (parts[0] === 'orders' && parts[1] && UUID.test(parts[1])) return { screen: 'order', id: parts[1] };
  if (parts[0] === 'market' || parts.length === 0) return { screen: 'market', asset: u.searchParams.get('asset') ?? undefined, fiat: u.searchParams.get('fiat') ?? undefined };
  if (parts[0] === 'wallet') return { screen: 'wallet' };
  return { screen: 'unknown' };
}
/** Map a push notification's data payload to a route (order events carry orderId). */
export function routeForNotification(data: Record<string, unknown> | undefined): Route {
  const id = typeof data?.orderId === 'string' ? data.orderId : undefined;
  return id && UUID.test(id) ? { screen: 'order', id } : { screen: 'market' };
}
export function routeToPath(r: Route): string {
  if (r.screen === 'order') return `/orders/${r.id}`;
  if (r.screen === 'wallet') return '/wallet';
  if (r.screen === 'market') return `/${r.fiat || r.asset ? `?${new URLSearchParams({ ...(r.asset ? { asset: r.asset } : {}), ...(r.fiat ? { fiat: r.fiat } : {}) })}` : ''}`;
  return '/';
}
