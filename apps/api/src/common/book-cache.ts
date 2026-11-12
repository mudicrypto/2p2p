import type Redis from 'ioredis';
import { bookCacheHits } from './metrics';
/**
 * Order-book cache (M14): hot book queries are served from Redis for a short TTL and invalidated
 * by `book.updated` events for that asset/fiat (published on every ad/order change, across instances).
 */
const TTL_SEC = Number(process.env.BOOK_CACHE_TTL_SEC ?? 2);
export class BookCache {
  constructor(private redis: Redis | null) {}
  private key(q: Record<string, unknown>) { return `book:${q.asset}:${q.fiat}:${JSON.stringify(Object.entries(q).sort())}`; }
  async get<T>(q: Record<string, unknown>, load: () => Promise<T>): Promise<T> {
    if (!this.redis) return load();
    const k = this.key(q);
    const hit = await this.redis.get(k).catch(() => null);
    if (hit) { bookCacheHits.inc({ result: 'hit' }); return JSON.parse(hit) as T; }
    bookCacheHits.inc({ result: 'miss' });
    const v = await load();
    await this.redis.set(k, JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)), 'EX', TTL_SEC).catch(() => null);
    return v;
  }
  async invalidate(asset: string, fiat: string) {
    if (!this.redis) return;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `book:${asset}:${fiat}:*`, 'COUNT', 200);
      cursor = next;
      if (keys.length) await this.redis.del(...keys);
    } while (cursor !== '0');
  }
}

let current: BookCache = new BookCache(null);
export const setBookCache = (c: BookCache) => { current = c; };
export const bookCache = () => current;
