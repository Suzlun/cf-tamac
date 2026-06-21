import { AgentSectionShell } from '../../management-content';

interface AgentSectionPageProps {
  readonly params: {
    readonly agentId: string;
  };
}

export default function AgentThreadsPage({ params }: AgentSectionPageProps) {
  return <AgentSectionShell agentId={params.agentId} section="threads" />;
}
