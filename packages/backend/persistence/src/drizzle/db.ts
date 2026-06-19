import { drizzle } from 'drizzle-orm/d1';

import type { Bindings } from '@cfreact-template-backend/types';

/** Drizzle client type for D1 connections. */
export type DrizzleClient = ReturnType<typeof drizzle>;

/** Create a Drizzle client from the D1 binding. */
export const createDrizzleClient = (database: Bindings['DB']): DrizzleClient => {
  return drizzle(database);
};
