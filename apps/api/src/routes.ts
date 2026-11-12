/** Route listing for the OpenAPI document, derived from Nest metadata. */
import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CONTROLLERS } from './modules';

export function ROUTES() {
  const out: Array<{ method: string; path: string }> = [];
  for (const C of CONTROLLERS) {
    const base = Reflect.getMetadata(PATH_METADATA, C) as string;
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const h = (C.prototype as any)[k];
      const p = Reflect.getMetadata(PATH_METADATA, h);
      const m = Reflect.getMetadata(METHOD_METADATA, h);
      if (p === undefined || m === undefined) continue;
      out.push({ method: RequestMethod[m], path: `/${[base, p].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '') });
    }
  }
  return out;
}
