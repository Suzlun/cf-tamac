import { AgentSectionShell } from '../../management-content';

interface AgentSectionPageProps {
  readonly params: {
    readonly agentId: string;
  };
}

export default function AgentExtensionsPage({ params }: AgentSectionPageProps) {
  return <AgentSectionShell agentId={params.agentId} section="extensions" />;
}
