import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import Redis from 'ioredis';
import { createDb } from '@p2p/db';
import { createProviders, type Providers } from '@p2p/providers';
import type { Ctx, DomainEvent, EventSink } from '@p2p/core';
import { AppModule } from './app.module';
import { RealtimeGateway } from './modules/realtime.gateway';

class RedisIoAdapter extends IoAdapter {
  constructor(app: any, private pub: Redis) { super(app); }
  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pub, this.pub.duplicate()));
    return server;
  }
}

/** Fan-out sink: websocket gateway + any extra sinks (notification queue etc.). */
export class CompositeSink implements EventSink {
  sinks: EventSink[] = [];
  publish(e: DomainEvent) { for (const s of this.sinks) void s.publish(e); }
}

export interface AppOptions { databaseUrl?: string; redisUrl?: string | null; providers?: Providers; logger?: boolean }

export async function createApp(opts: AppOptions = {}) {
  const dbh = createDb(opts.databaseUrl ?? process.env.DATABASE_URL);
  const redisUrl = opts.redisUrl === undefined ? process.env.REDIS_URL : opts.redisUrl;
  const redis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 2 }) : null;
  const sink = new CompositeSink();
  const ctx: Ctx = { db: dbh.db, read: dbh.read, providers: opts.providers ?? createProviders(), events: sink, now: () => new Date() };
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(ctx, redis), { logger: opts.logger === false ? false : ['error', 'warn', 'log'], rawBody: true });
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(cookieParser());
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true });
  if (redis) app.useWebSocketAdapter(new RedisIoAdapter(app, redis));
  sink.sinks.push(app.get(RealtimeGateway));
  app.enableShutdownHooks();
  const close = async () => { await app.close(); await dbh.close(); redis?.disconnect(); };
  return { app, ctx, redis, sink, close };
}
