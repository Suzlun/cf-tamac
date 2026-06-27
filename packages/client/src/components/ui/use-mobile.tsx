'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Shadcn Sidebar がモバイル表示を判断するための React Hook。
 *
 * `window.matchMedia` と現在の viewport 幅を使い、sidebar を desktop 表示にするか
 * mobile sheet 表示にするかを boolean で返します。初回 render では browser API を
 * 参照せず、effect 実行後に状態を同期するため、Server Component から渡された UI と
 * client hydrate の境界で不要な副作用を起こしません。
 *
 * @returns viewport 幅が mobile breakpoint 未満であれば `true`、それ以外は `false`。
 *
 * @example
 * ```tsx
 * const isMobile = useIsMobile()
 * return isMobile ? <MobileNavigation /> : <DesktopNavigation />
 * ```
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // MediaQueryList を購読し、画面幅の変化を sidebar 表示状態へ反映します。
    const mediaQuery = window.matchMedia(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`);
    const updateIsMobile = () => {
      // 現在幅を直接確認し、query event と初回同期の両方で同じ判定に揃えます。
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    mediaQuery.addEventListener('change', updateIsMobile);
    updateIsMobile();

    return () => {
      // component unmount 時に listener を解除し、不要な browser 側副作用を残しません。
      mediaQuery.removeEventListener('change', updateIsMobile);
    };
  }, []);

  return isMobile === true;
}
