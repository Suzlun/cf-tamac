import { defineConfig } from 'drizzle-kit';

function requireEnv(value: string | undefined, key: string): string {
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${key} is required`);
  }

  return value;
}

const CLOUDFLARE_ACCOUNT_ID = requireEnv(
  process.env.CLOUDFLARE_ACCOUNT_ID,
  'CLOUDFLARE_ACCOUNT_ID'
);
const CLOUDFLARE_DATABASE_ID = requireEnv(
  process.env.CLOUDFLARE_DATABASE_ID,
  'CLOUDFLARE_DATABASE_ID'
);
const CLOUDFLARE_D1_TOKEN = requireEnv(process.env.CLOUDFLARE_D1_TOKEN, 'CLOUDFLARE_D1_TOKEN');

export default defineConfig({
  out: './drizzle/migrations',
  schema: './packages/backend/drizzle/src/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: CLOUDFLARE_ACCOUNT_ID,
    databaseId: CLOUDFLARE_DATABASE_ID,
    token: CLOUDFLARE_D1_TOKEN,
  },
});
