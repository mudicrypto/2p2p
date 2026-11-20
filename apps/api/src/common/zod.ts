import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { registerSchema } from '../openapi';
/** Validate a body/query with a shared zod schema. */
export class Zod<T extends ZodTypeAny> implements PipeTransform {
  constructor(private schema: T, name?: string) { if (name) registerSchema(name, schema); }
  transform(v: unknown): z.infer<T> { return this.schema.parse(v); }
}
