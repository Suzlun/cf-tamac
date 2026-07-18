'use client';

import { Pin, PinOff, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cn } from '@cf-tamac/client/lib/utils';

import { ControlRoomFrame } from './control-room-frame';
import { EmptyState } from './empty-state';
import { SignalBadge } from './signal-badge';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined || ms === 0) {
    return '—';
  }
  const timestamp = new Date(ms);
  if (Number.isNaN(timestamp.getTime())) {
    return '—';
  }
  // SSR と browser hydration で同一文字列にするため、locale/timezone 依存の整形を避けて UTC を明示する。
  return `${timestamp.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/**
 * credential status 文字列を SignalBadge variant へ割り当てる。
 * 色（variant）だけではなく label でも状態を伝える。
 */
function credentialStatusVariant(status: string): 'signal' | 'muted' | 'error' {
  if (status === 'active') return 'signal';
  if (status === 'rotating') return 'error';
  return 'muted';
}

/**
 * pinned → displayOrder/displayName の優先順位で Agent を並び替える。
 */
function compareAgents(a: AgentListItem, b: AgentListItem, key: SortKey): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  if (key === 'displayName') {
    return a.displayName.localeCompare(b.displayName);
  }
  if (key === 'lastOpenedAtMs') {
    return (b.lastOpenedAtMs ?? 0) - (a.lastOpenedAtMs ?? 0);
  }
  return a.displayOrder - b.displayOrder;
}

/**
 * Client-side Agent registry list（AGENT-MANAGEMENT-UI-S001 / S019）。
 *
 * タスク 3.1: table 偏重を廃止し、card/list composition で pin/sort/last-opened/
 * credential status/selection を表示する。並び順は Select で制御し、
 * 選択で server-side markManagedAgentOpened action を呼ぶ。表示専用の browser-safe props のみ扱い、
 * Agent credential/RPC seam には触れない。
 *
 * 各 card は displayName, agentId, agentRpcOrigin, pinned, displayOrder, lastOpenedAtMs,
 * credentialStatus, "Connection" の "Registry only" 注記を含む。
 */
export function AgentList({ agents, onPin, onOpen }: AgentListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>('displayOrder');
  const sortedAgents = [...agents].sort((a, b) => compareAgents(a, b, sortKey));

  const handleOpen = (agentId: string) => {
    // Agent 選択時の last-opened 更新は台帳の補助情報なので、失敗しても利用者の Agent 遷移を止めない。
    startTransition(async () => {
      try {
        await onOpen(agentId);
      } catch {
        // bookkeeping 失敗は server 側で記録される可能性があるため、Browser では secret-free に握りつぶして遷移を優先する。
      }
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
      description="Agents registered in this Client. Agent domain state lives in the Agent Worker."
      actions={
        // タスク 2.5: New Agent は Agents screen の primary action として registration flow を開く。
        <Button asChild variant="default">
          <Link href="/agents/new">New Agent</Link>
        </Button>
      }
    >
      <section aria-label="Managed Agents" className="space-y-4">
        {/* 並び順の操作。card/list composition なので column sort ではなく select で制御する。 */}
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="agent-sort" className="text-sm text-muted-foreground">
            Sort by
          </label>
          <Select
            value={sortKey}
            onValueChange={(value) => {
              setSortKey(value as SortKey);
            }}
          >
            <SelectTrigger id="agent-sort" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="displayOrder">Display order</SelectItem>
              <SelectItem value="displayName">Display name</SelectItem>
              <SelectItem value="lastOpenedAtMs">Last opened</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {agents.length === 0 ? (
          <EmptyState
            eyebrow="EMPTY LEDGER"
            heading="Register the first managed Agent."
            lead="Add an Agent ID, RPC origin, and credential reference; Agent domain state remains inside the Agent Worker."
            action={
              <Button asChild variant="default">
                <Link href="/agents/new">New Agent</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-4">
            {sortedAgents.map((agent) => (
              <li key={agent.agentId}>
                <AgentRegistryCard
                  agent={agent}
                  pending={isPending}
                  onPin={handlePin}
                  onOpen={handleOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ControlRoomFrame>
  );
}

interface AgentRegistryCardProps {
  readonly agent: AgentListItem;
  readonly pending: boolean;
  readonly onPin: (agentId: string, pinned: boolean) => void;
  readonly onOpen: (agentId: string) => void;
}

/**
 * 単一 Agent の registry card。pin toggle・credential status・選択 action を含む。
 * nested card を避けるため、単一の Card に summary をまとめる。
 */
function AgentRegistryCard({ agent, pending, onPin, onOpen }: AgentRegistryCardProps) {
  return (
    <Card className={cn('shadow-sm', agent.pinned && 'border-primary/60')}>
      <CardHeader className="space-y-5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {/* pin toggle: aria-pressed と aria-label で状態を通知する。 */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${agent.pinned ? 'Unpin' : 'Pin'} ${agent.displayName}`}
              aria-pressed={agent.pinned}
              disabled={pending}
              onClick={() => {
                onPin(agent.agentId, agent.pinned);
              }}
              className="mt-1 shrink-0 text-muted-foreground"
            >
              {agent.pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
            </Button>
            <div className="min-w-0 space-y-1">
              <CardTitle className="truncate text-base leading-6">{agent.displayName}</CardTitle>
              <CardDescription className="truncate font-mono text-xs leading-5">
                {agent.agentId}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <SignalBadge
              label={agent.credentialStatus.toUpperCase()}
              variant={credentialStatusVariant(agent.credentialStatus)}
            />
            <Badge
              variant="outline"
              className="px-3 py-1 font-mono font-normal text-muted-foreground"
              title="Registry route does not perform live Agent RPC checks; open overview for live status."
            >
              Connection: Registry only
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                onOpen(agent.agentId);
              }}
              aria-label={`Open ${agent.displayName} overview`}
            >
              Open
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0 text-sm text-muted-foreground">
        <dl className="grid gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide">RPC origin</dt>
            <dd className="truncate font-mono leading-6 text-foreground">{agent.agentRpcOrigin}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide">Display order</dt>
            <dd className="font-mono leading-6 text-foreground">{agent.displayOrder}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide">Last opened</dt>
            <dd className="font-mono leading-6 text-foreground">
              {formatTimestamp(agent.lastOpenedAtMs)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
