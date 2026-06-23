import Link from 'next/link';

interface SectionLink {
  readonly slug: string;
  readonly label: string;
  readonly href: string;
}

interface SectionNavProps {
  readonly agentId?: string;
  readonly current?: string;
}

/**
 * Horizontal section navigation for the Agent management chrome.
 *
 * Renders registry-level links when no `agentId` is provided, otherwise
 * renders the per-Agent section tabs required by the management wireframe.
 */
export function SectionNav({ agentId, current }: SectionNavProps) {
  const registryLinks: readonly SectionLink[] = [
    { slug: 'registry', label: 'Registry', href: '/agents' },
    { slug: 'new', label: 'New', href: '/agents/new' },
  ];

  const renderLink = (link: SectionLink) => {
    const isActive = current === link.slug;
    return (
      <Link
        key={link.slug}
        className={`nav-link${isActive ? ' state-pending' : ''}`}
        href={link.href}
        aria-current={isActive ? 'page' : undefined}
      >
        {link.label}
      </Link>
    );
  };

  if (agentId === undefined) {
    return (
      <nav aria-label="Agent management sections" className="section-nav">
        {registryLinks.map(renderLink)}
      </nav>
    );
  }

  const agentLinks: readonly SectionLink[] = [
    { slug: 'overview', label: 'Overview', href: `/agents/${agentId}` },
    { slug: 'threads', label: 'Threads', href: `/agents/${agentId}/threads` },
    { slug: 'events', label: 'Events', href: `/agents/${agentId}/events` },
    { slug: 'runs', label: 'Runs', href: `/agents/${agentId}/runs` },
    { slug: 'compactions', label: 'Compactions', href: `/agents/${agentId}/compactions` },
    { slug: 'schedules', label: 'Schedules', href: `/agents/${agentId}/schedules` },
    { slug: 'tools', label: 'Tools', href: `/agents/${agentId}/tools` },
    { slug: 'integrations', label: 'Integrations', href: `/agents/${agentId}/integrations` },
    { slug: 'settings', label: 'Settings', href: `/agents/${agentId}/settings` },
  ];

  return (
    <nav aria-label="Agent management sections" className="section-nav">
      {agentLinks.map(renderLink)}
    </nav>
  );
}
