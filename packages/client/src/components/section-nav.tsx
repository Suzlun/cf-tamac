import Link from 'next/link';

import { cn } from '@cf-tamac/client/lib/utils';

import { SidebarMenuButton } from './ui/sidebar';

// 純粋データ（JSX なし）は management-nav-config.ts に集約し、.ts テストからも import 可能にする。
export {
  AGENT_SECTION_NAV_ITEMS,
  GLOBAL_NAV_ITEMS,
  SUPPORTED_MANAGEMENT_ROUTES,
  buildAgentSectionHref,
} from './management-nav-config';

interface NavLinkProps {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly className?: string;
}

/**
 * sidebar 用の単一 navigation link。Shadcn token のみで active状態を表現する。
 * color alone ではなく `aria-current="page"` で現在位置を示す。
 */
export function SidebarNavLink({ href, label, active, className }: NavLinkProps) {
  return (
    <SidebarMenuButton asChild isActive={active} className={cn('h-9', className)}>
      <Link href={href} aria-current={active ? 'page' : undefined}>
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}
