'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { ControlRoomFrame } from './control-room-frame';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { SignalBadge } from './signal-badge';
import { Button } from './ui/button';

interface AgentListItem {
  readonly agentId: string;
  readonly displayName: string;
  readonly agentRpcOrigin: string;
  readonly pinned: boolean;
  readonly displayOrder: number;
  readonly lastOpenedAtMs?: number;
  readonly credentialStatus: string;
}

interface AgentListProps {
  readonly agents: readonly AgentListItem[];
  readonly onPin: (agentId: string, pinned: boolean) => Promise<unknown>;
  readonly onOpen: (agentId: string) => Promise<unknown>;
}

type SortKey = 'displayName' | 'displayOrder' | 'lastOpenedAtMs';
type SortDirection = 'ascending' | 'descending';

interface SortState {
  readonly key: SortKey;
  readonly direction: SortDirection;
}

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined || ms === 0) {
    return '—';
  }
  return new Date(ms).toLocaleString();
}

function credentialStatusVariant(status: string): 'signal' | 'muted' | 'error' {
  if (status === 'active') return 'signal';
  if (status === 'rotating') return 'error';
  return 'muted';
}

function compareAgents(a: AgentListItem, b: AgentListItem, sort: SortState): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  const directional = compareSortValue(a, b, sort.key);
  if (directional !== 0) {
    return sort.direction === 'ascending' ? directional : -directional;
  }
  return a.displayName.localeCompare(b.displayName);
}

function compareSortValue(a: AgentListItem, b: AgentListItem, key: SortKey): number {
  if (key === 'displayName') {
    return a.displayName.localeCompare(b.displayName);
  }
  if (key === 'lastOpenedAtMs') {
    return (a.lastOpenedAtMs ?? 0) - (b.lastOpenedAtMs ?? 0);
  }
  return a.displayOrder - b.displayOrder;
}

function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) {
    return { key, direction: key === 'lastOpenedAtMs' ? 'descending' : 'ascending' };
  }
  return {
    key,
    direction: current.direction === 'ascending' ? 'descending' : 'ascending',
  };
}

/**
 * Client-side Agent registry list with pin toggle and last-opened updates.
 *
 * Built on shadcn-style `ControlRoomFrame`, `DataTable`, `EmptyState`,
 * `SignalBadge`, and `Button` primitives per the wireframe §6.1.
 */
export function AgentList({ agents, onPin, onOpen }: AgentListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sort, setSort] = useState<SortState>({ key: 'displayOrder', direction: 'ascending' });
  const sortedAgents = [...agents].sort((a, b) => compareAgents(a, b, sort));

  const handleOpen = (agentId: string) => {
    startTransition(async () => {
      await onOpen(agentId);
      router.push(`/agents/${agentId}`);
    });
  };

  const handlePin = (agentId: string, pinned: boolean) => {
    startTransition(async () => {
      await onPin(agentId, !pinned);
    });
  };

  return (
    <ControlRoomFrame
      title="Agent registry"
      signalLabel="management ledger"
      currentSection="registry"
    >
      <p className="eyebrow">Client-owned management ledger</p>
      <h2>Managed Agents</h2>
      <p className="lead">
        Agents registered in this Client. Agent domain state lives in the Agent Worker.
      </p>
      <div className="action-row">
        <Button asChild variant="default">
          <Link href="/agents/new">New Agent record</Link>
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          eyebrow="EMPTY LEDGER"
          heading="Register the first managed Agent."
          lead="Add an Agent ID, RPC origin, and credential reference; Agent domain state remains inside the Agent Worker."
          action={
            <Button asChild variant="default">
              <Link href="/agents/new">New Agent record</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          ariaLabel="Managed Agents"
          headers={buildHeaders(sort, (key) => {
            setSort((current) => nextSort(current, key));
          })}
          rows={sortedAgents.map((agent) => [
            <button
              key={`pin-${agent.agentId}`}
              type="button"
              aria-label={`${agent.pinned ? 'Unpin' : 'Pin'} ${agent.displayName}`}
              aria-pressed={agent.pinned}
              className="font-mono text-sm text-foreground hover:text-signal disabled:opacity-50"
              disabled={isPending}
              onClick={() => {
                handlePin(agent.agentId, agent.pinned);
              }}
            >
              {agent.pinned ? '▲' : '▽'}
            </button>,
            <button
              key={`name-${agent.agentId}`}
              type="button"
              className="font-mono text-sm text-cyan hover:underline disabled:opacity-50"
              onClick={() => {
                handleOpen(agent.agentId);
              }}
              disabled={isPending}
            >
              {agent.displayName}
            </button>,
            <span key={`id-${agent.agentId}`} className="font-mono">
              {agent.agentId}
            </span>,
            <span
              key={`origin-${agent.agentId}`}
              title={agent.agentRpcOrigin}
              className="font-mono truncate block max-w-xs"
            >
              {agent.agentRpcOrigin}
            </span>,
            <span key={`order-${agent.agentId}`} className="font-mono">
              {agent.displayOrder}
            </span>,
            <span key={`opened-${agent.agentId}`} className="font-mono">
              {formatTimestamp(agent.lastOpenedAtMs)}
            </span>,
            <SignalBadge
              key={`cred-${agent.agentId}`}
              label={agent.credentialStatus.toUpperCase()}
              variant={credentialStatusVariant(agent.credentialStatus)}
            />,
            <span
              key={`connection-${agent.agentId}`}
              className="font-mono text-muted-foreground"
              title="Registry route does not perform live Agent RPC checks; open overview for live status."
            >
              Registry only
            </span>,
          ])}
        />
      )}
    </ControlRoomFrame>
  );
}

function buildHeaders(sort: SortState, onSort: (key: SortKey) => void) {
  return [
    'Pin',
    sortableHeader('Display name', 'displayName', sort, onSort),
    'Agent ID',
    'RPC origin',
    sortableHeader('Display order', 'displayOrder', sort, onSort),
    sortableHeader('Last opened', 'lastOpenedAtMs', sort, onSort),
    'Credential',
    'Connection',
  ];
}

function sortableHeader(
  label: string,
  key: SortKey,
  sort: SortState,
  onSort: (key: SortKey) => void
): {
  readonly label: string;
  readonly content: ReactNode;
  readonly ariaSort: 'ascending' | 'descending' | 'none';
} {
  const active = sort.key === key;
  const ariaSort = active ? sort.direction : 'none';
  return {
    label,
    ariaSort,
    content: (
      <button
        type="button"
        className="font-mono uppercase tracking-wider text-primary hover:text-signal"
        onClick={() => {
          onSort(key);
        }}
      >
        {label}
      </button>
    ),
  };
}
