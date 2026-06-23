import { Badge } from './ui/badge';
import { cn } from './ui/cn';

interface AgentTokenProps {
  readonly agentId: string;
  readonly className?: string;
}

/**
 * Monospace Agent ID chip used across overview and detail routes.
 *
 * Built on the shadcn-style `Badge` primitive with `outline` variant (dashed
 * cyan border) per the wireframe §5.1 `AgentToken` mapping.
 */
export function AgentToken({ agentId, className }: AgentTokenProps) {
  return (
    <Badge
      variant="outline"
      aria-label={`Agent ID ${agentId}`}
      className={cn('mt-4 border-dashed', className)}
    >
      agent_id: {agentId}
    </Badge>
  );
}
