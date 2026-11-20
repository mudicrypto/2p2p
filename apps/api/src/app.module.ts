import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type Redis from 'ioredis';
import { CTX, REDIS, type Ctx } from './common/ctx';
import { ErrorsFilter } from './common/errors.filter';
import { AuthGuard } from './common/auth.guard';
import { RateLimitGuard } from './common/rate-limit.guard';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { BigintInterceptor } from './common/serialize.interceptor';
import { RealtimeGateway } from './modules/realtime.gateway';
import { CONTROLLERS } from './modules';

@Module({})
export class AppModule {
  static register(ctx: Ctx, redis: Redis | null, extra: Type[] = []): DynamicModule {
    return {
      module: AppModule,
      controllers: [...CONTROLLERS, ...extra],
      providers: [
        { provide: CTX, useValue: ctx },
        { provide: REDIS, useValue: redis },
        RealtimeGateway,
        { provide: APP_FILTER, useClass: ErrorsFilter },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: BigintInterceptor },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    };
  }
}
