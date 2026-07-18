import './globals.css';

import { ManagementShell } from '../src/components/management-shell';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'cf-tamac Management Client',
  description: 'Server-side management shell for cf-tamac Agents.',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

/**
 * Management Client の root layout。
 *
 * 全 route を左サイドバー shell（global/selected-Agent scope 分離）で包み、
 * skip link と responsive navigation を提供する。Server Component として描画し、
 * Agent credential や direct Agent RPC invocation logic は含まない。
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>
        <ManagementShell>{children}</ManagementShell>
      </body>
    </html>
  );
}
