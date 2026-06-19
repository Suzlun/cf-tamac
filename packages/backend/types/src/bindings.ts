import type { D1Database, KVNamespace, R2Bucket, SendEmail } from '@cloudflare/workers-types';

/** Cloudflare bindings consumed by the worker. */
export interface Bindings {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  EMAIL: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_TO?: string;
}
