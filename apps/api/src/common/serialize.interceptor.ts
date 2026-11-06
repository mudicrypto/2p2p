import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { jsonBigint } from '@p2p/shared';
/** bigint -> string for JSON responses (never floats). */
@Injectable()
export class BigintInterceptor implements NestInterceptor {
  intercept(_c: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((v) => (v === undefined ? v : JSON.parse(JSON.stringify(v, jsonBigint)))));
  }
}
