import Link from 'next/link';

interface AgentSection {
  readonly slug: string;
  readonly label: string;
  readonly summary: string;
}

const agentSections: readonly AgentSection[] = [
  {
    slug: 'threads',
    label: 'Threads',
    summary:
      'Thread identity and memory views stay read-only until Agent RPC handlers are enabled.',
  },
  {
    slug: 'events',
    label: 'Events',
    summary: 'Accepted event activity will be read from Agent RPC, not copied into Client D1.',
  },
  {
    slug: 'schedules',
    label: 'Schedules',
    summary: 'Schedule shell reserves the management route without exposing a REST proxy.',
  },
  {
    slug: 'tools',
    label: 'Tools',
    summary: 'Tool approval surfaces remain server-side and credential-free in browser bundles.',
  },
  {
    slug: 'integrations',
    label: 'Integrations',
    summary: 'Integration installation shells avoid storing Agent-owned installation snapshots.',
  },
  {
    slug: 'settings',
    label: 'Settings',
    summary: 'Client-owned display metadata and credential references are configured here.',
  },
];

interface AgentShellProps {
  readonly agentId?: string;
  readonly section?: string;
}

export function AgentRegistryShell() {
  return (
    <section className="control-room">
      <div className="topline">
        <span>Agent registry</span>
        <span className="signal">empty ledger ready</span>
      </div>
      <div className="page-band">
        <p className="eyebrow">Client-owned management ledger</p>
        <h2>Register the first managed Agent.</h2>
        <p className="lead">
          The registry starts empty. Add an Agent ID, RPC origin, and credential reference; Agent
          domain state remains inside the Agent Worker.
        </p>
        <div className="action-row">
          <Link className="primary-action" href="/agents/new">
            New Agent record
          </Link>
          <Link className="nav-link" href="/agents/example-agent">
            Preview detail shell
          </Link>
        </div>
        <AgentRouteGrid />
      </div>
    </section>
  );
}

export function NewAgentShell() {
  return (
    <AgentShellFrame section="new">
      <p className="eyebrow">Registration shell</p>
      <h2>Capture references, not secrets.</h2>
      <p className="lead">
        This route reserves the server-side registration flow for Agent ID, RPC origin, display
        metadata, and credential reference creation.
      </p>
      <div className="readout">
        <strong>Next implementation seam</strong>
        <span>
          Server Actions will write Client D1 management records without persisting Agent snapshots.
        </span>
      </div>
    </AgentShellFrame>
  );
}

export function AgentSectionShell({
  agentId = 'unregistered-agent',
  section = 'overview',
}: AgentShellProps) {
  const activeSection = getSection(section);
  return (
    <AgentShellFrame agentId={agentId} section={section}>
      <p className="eyebrow">{activeSection.label}</p>
      <h2>{activeSection.heading}</h2>
      <span className="agent-token">agent_id: {agentId}</span>
      <p className="lead">{activeSection.body}</p>
      <AgentRouteGrid agentId={agentId} />
    </AgentShellFrame>
  );
}

interface AgentShellFrameProps {
  readonly children: React.ReactNode;
  readonly agentId?: string;
  readonly section: string;
}

function AgentShellFrame({ children, agentId, section }: AgentShellFrameProps) {
  return (
    <section className="control-room">
      <div className="topline">
        <Link href="/agents">Agent registry</Link>
        <span className="signal">{section} shell</span>
      </div>
      <div className="page-band">
        <div className="section-nav">
          <Link className="nav-link" href="/agents">
            Registry
          </Link>
          <Link className="nav-link" href="/agents/new">
            New
          </Link>
          {agentId !== undefined ? (
            <Link className="nav-link" href={`/agents/${agentId}`}>
              Overview
            </Link>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function AgentRouteGrid({ agentId = 'example-agent' }: { readonly agentId?: string }) {
  return (
    <div className="route-grid">
      {agentSections.map((item) => (
        <Link className="route-card" href={`/agents/${agentId}/${item.slug}`} key={item.slug}>
          <strong>{item.label}</strong>
          <span>{item.summary}</span>
        </Link>
      ))}
    </div>
  );
}

function getSection(section: string) {
  const match = agentSections.find((item) => item.slug === section);
  if (match !== undefined) {
    return {
      label: match.label,
      heading: `${match.label} are staged for server-side Agent RPC.`,
      body: match.summary,
    };
  }
  return {
    label: 'Overview',
    heading: 'Detail shell is ready for Agent management.',
    body: 'This page displays Client-owned metadata only and keeps Agent RPC calls on the server side.',
  };
}
