import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly eyebrow: string;
  readonly heading: string;
  readonly lead: string;
  readonly action?: ReactNode;
  readonly actionHref?: string;
  readonly actionLabel?: string;
}

/**
 * Centered empty-state panel used by all list views when no records exist.
 *
 * Built on the shadcn-style `Card` primitive with `Button` action per the
 * wireframe §5.1 `EmptyState` mapping.
 */
export function EmptyState({
  eyebrow,
  heading,
  lead,
  action,
  actionHref,
  actionLabel,
}: EmptyStateProps) {
  return (
    <Card className="text-center" role="status">
      <CardContent className="pt-6">
        <p className="font-mono text-xs uppercase tracking-wider text-cyan mb-2">{eyebrow}</p>
        <h3 className="font-serif text-2xl mb-2">{heading}</h3>
        <p className="text-muted-foreground text-sm max-w-prose mx-auto mb-4">{lead}</p>
        {action !== undefined ? (
          <div className="flex justify-center">{action}</div>
        ) : actionHref !== undefined && actionLabel !== undefined ? (
          <div className="flex justify-center">
            <Button asChild variant="default">
              <a href={actionHref}>{actionLabel}</a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
