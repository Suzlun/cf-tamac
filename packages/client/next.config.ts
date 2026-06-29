import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

import type { NextConfig } from 'next';

interface OpenNextDevContext {
  readonly env?: Record<string, unknown>;
}

const cloudflareContextSymbol = Symbol.for('__cloudflare-context__');

// Next.js dev server 上で Server Components / Server Actions が Cloudflare binding を参照できるよう、
// OpenNext の開発用 Cloudflare context を設定する。Worker Secret は wrangler の platform proxy が
// process env から自動注入しないため、E2E が生成した一時値だけを dev context へ反映する。
void initOpenNextCloudflareForDev().then(applyLocalDevSecretOverrides);

function applyLocalDevSecretOverrides(): void {
  const encryptionKey = process.env.CLIENT_CREDENTIAL_ENCRYPTION_KEY;
  if (encryptionKey === undefined || encryptionKey === '') {
    return;
  }

  const context = Reflect.get(globalThis, cloudflareContextSymbol) as
    | OpenNextDevContext
    | undefined;
  if (context?.env === undefined) {
    return;
  }

  // E2E 専用の一時 AES key を dev process 内の Cloudflare env にだけ注入し、repository に固定 secret を残さない。
  context.env.CLIENT_CREDENTIAL_ENCRYPTION_KEY = encryptionKey;
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
};

export default nextConfig;
