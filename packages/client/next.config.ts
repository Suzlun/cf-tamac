import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

import type { NextConfig } from 'next';

// Next.js dev server 上で Server Components / Server Actions が Cloudflare binding を参照できるよう、
// OpenNext の開発用 Cloudflare context を設定する。初期化 Promise は OpenNext 側の dev context 登録副作用を開始する用途なので、
// Next config の評価をブロックせず、未処理 Promise ではないことを `void` で明示する。
void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
};

export default nextConfig;
