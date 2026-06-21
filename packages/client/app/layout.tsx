import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'cf-tamac Management Client',
  description: 'Server-side management shell for cf-tamac Agents.',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>
        <main className="app-shell">{children}</main>
      </body>
    </html>
  );
}
