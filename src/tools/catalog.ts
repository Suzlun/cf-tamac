import { computeSha256Hex } from '../domain/security';

import type { AgentToolsRepository, AgentToolDefinitionRow } from '../storage';

/**
 * Agent が内蔵する ToolDefinition です。
 *
 * @remarks
 * Provider target を持たない Agent-local Tool として catalog に含めます。外部 Provider へ作用する
 * Integration Tool は storage repository から組み立てます。
 */
export interface BuiltInToolDefinition {
  readonly approvalRequired: boolean;
  readonly description: string;
  readonly displayName: string;
  readonly inputSchemaRef: string;
  readonly outputSchemaRef: string;
  readonly toolId: string;
  readonly version: string;
}

/**
 * RPC や Run snapshot に返す ToolDefinition view です。
 */
export interface AgentToolDefinitionView {
  readonly agentId: string;
  readonly approvalRequired: boolean;
  readonly cancellationSupported: boolean;
  readonly description?: string;
  readonly displayName: string;
  readonly inputSchemaRef?: string;
  readonly installationId?: string;
  readonly outputSchemaRef?: string;
  readonly providerTargetRef?: string;
  readonly status: string;
  readonly toolId: string;
  readonly toolSetVersion: number;
  readonly version: string;
}

/**
 * Tool catalog assembly の結果です。
 */
export interface AgentToolCatalogSnapshot {
  readonly digestSha256: string;
  readonly snapshotRef: string;
  readonly tools: readonly AgentToolDefinitionView[];
  readonly toolSetVersion: number;
}

/**
 * Tool catalog assembly の入力です。
 */
export interface AssembleToolCatalogInput {
  readonly agentId: string;
  readonly includeUnavailable?: boolean;
  readonly installationId?: string;
  readonly nowMs: number;
  readonly persistSnapshot?: boolean;
  readonly repositories: { readonly tools: AgentToolsRepository };
}

/**
 * Stage 6 の標準 built-in ToolDefinition 一覧です。
 */
export const builtInToolDefinitions = [
  {
    approvalRequired: false,
    description: 'Thread へ Agent-local informational Event を追加する built-in Tool。',
    displayName: 'Emit Thread Event',
    inputSchemaRef: 'builtin://schemas/tool/agent.thread.emit_event/input/v1',
    outputSchemaRef: 'builtin://schemas/tool/agent.thread.emit_event/output/v1',
    toolId: 'agent.thread.emit_event',
    version: '1.0.0',
  },
] as const satisfies readonly BuiltInToolDefinition[];

/**
 * built-in と active Integration ToolDefinition から versioned catalog snapshot を組み立てます。
 *
 * @param input Agent ID、repository set、filter、snapshot 保存要否です。
 * @returns 利用可能 Tool 一覧、Tool set version、digest 参照を返します。
 * @throws Error snapshot 保存後の repository 整合性が崩れた場合に発生します。
 * @example
 * ```ts
 * const catalog = await assembleToolCatalog({ agentId, nowMs, repositories });
 * ```
 */
export async function assembleToolCatalog(
  input: AssembleToolCatalogInput
): Promise<AgentToolCatalogSnapshot> {
  const repositoryTools = input.repositories.tools
    .listDefinitions({
      includeUnavailable: input.includeUnavailable,
      installationId: input.installationId,
      limit: 500,
    })
    .map((row) => mapToolDefinitionRow(input.agentId, row));
  const builtIns = createBuiltInToolViews(input.agentId);
  const tools = [...builtIns, ...repositoryTools].sort((left, right) =>
    left.toolId.localeCompare(right.toolId)
  );
  const digestSha256 = await computeToolCatalogDigest(tools);
  const toolSetVersion =
    input.persistSnapshot === true ? input.repositories.tools.getNextToolSetVersion() : 0;
  const snapshotRef = createToolCatalogSnapshotRef(input.agentId, digestSha256, toolSetVersion);
  if (input.persistSnapshot === true) {
    input.repositories.tools.createCatalogSnapshot({
      createdAtMs: input.nowMs,
      definitionCount: tools.length,
      digestSha256,
      snapshotRef,
      toolSetVersion,
    });
  }
  return { digestSha256, snapshotRef, tools, toolSetVersion };
}

/**
 * ToolDefinition row を Tool catalog view へ変換します。
 *
 * @param agentId Durable Object identity と一致する Agent ID です。
 * @param row storage layer が返した ToolDefinition row です。
 * @returns RPC と Run snapshot 用の安全な ToolDefinition view です。
 */
export function mapToolDefinitionRow(
  agentId: string,
  row: AgentToolDefinitionRow
): AgentToolDefinitionView {
  return {
    agentId,
    approvalRequired: row.approvalRequired === 1,
    cancellationSupported: row.cancellationSupported === 1,
    description: row.description ?? undefined,
    displayName: row.displayName,
    inputSchemaRef: row.inputSchemaRef ?? undefined,
    installationId: row.installationId ?? undefined,
    outputSchemaRef: row.outputSchemaRef ?? undefined,
    providerTargetRef: row.providerTargetRef ?? undefined,
    status: row.status,
    toolId: row.toolId,
    toolSetVersion: row.toolSetVersion,
    version: row.version,
  };
}

function createBuiltInToolViews(agentId: string): AgentToolDefinitionView[] {
  return builtInToolDefinitions.map((definition) => toBuiltInToolView(agentId, definition));
}

function toBuiltInToolView(
  agentId: string,
  definition: BuiltInToolDefinition
): AgentToolDefinitionView {
  return {
    agentId,
    approvalRequired: definition.approvalRequired,
    cancellationSupported: false,
    description: definition.description,
    displayName: definition.displayName,
    inputSchemaRef: definition.inputSchemaRef,
    outputSchemaRef: definition.outputSchemaRef,
    status: 'active',
    toolId: definition.toolId,
    toolSetVersion: 0,
    version: definition.version,
  };
}

async function computeToolCatalogDigest(
  tools: readonly AgentToolDefinitionView[]
): Promise<string> {
  const canonical = JSON.stringify(
    tools.map((tool) => ({
      approvalRequired: tool.approvalRequired,
      installationId: tool.installationId,
      status: tool.status,
      toolId: tool.toolId,
      version: tool.version,
    }))
  );
  return computeSha256Hex(new TextEncoder().encode(canonical));
}

function createToolCatalogSnapshotRef(
  agentId: string,
  digestSha256: string,
  toolSetVersion: number
): string {
  return `agent-tool-catalog://${encodeURIComponent(agentId)}/${String(toolSetVersion)}/${digestSha256}`;
}
