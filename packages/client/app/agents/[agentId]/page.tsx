import { AgentSectionShell } from '../management-content';

interface AgentDetailPageProps {
  readonly params: {
    readonly agentId: string;
  };
}

export default function AgentDetailPage({ params }: AgentDetailPageProps) {
  return <AgentSectionShell agentId={params.agentId} />;
}
