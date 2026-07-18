import { harnessDecisionTypes, type HarnessDecision } from './decisions';

import type { HarnessContextBundle } from './context-builder';
import type { AgentRawBodyDigest } from '../domain/security/types';

/**
 * ModelProvider が返す正規化済み failure category です。
 */
export type ModelProviderFailureCategory =
  | 'missing_binding'
  | 'invalid_policy'
  | 'unsupported_provider'
  | 'unsupported_model'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_invalid_response'
  | 'malformed_model_output'
  | 'budget_exceeded';

/**
 * Model request に固定される policy identity です。
 */
export interface ModelRequestPolicyIdentity {
  readonly decisionSchemaVersion: string;
  readonly modelId: string;
  readonly policyDigest: string;
  readonly policyRef: string;
  readonly provider: string;
  readonly version: number;
}

/**
 * ModelProvider へ渡す安全な generation parameter です。
 *
 * @remarks
 * Agent-owned model policy で検証済みの数値だけを保持します。Provider credential、raw prompt、raw completion、
 * hidden reasoning は含めず、provider adapter が request body へ反映するために使います。
 *
 * @example
 * ```ts
 * const parameters = { maxOutputTokens: 1024, temperature: 0.2, topP: 0.9 };
 * ```
 */
export interface ModelGenerationParameters {
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
}

/**
 * ModelProvider に渡す secret-free request metadata です。
 */
export interface ModelProviderRequest {
  readonly context: HarnessContextBundle;
  readonly generationParameters: ModelGenerationParameters;
  readonly policy: ModelRequestPolicyIdentity;
  readonly promptDigest: AgentRawBodyDigest;
  readonly promptText: string;
  readonly runId: string;
  readonly threadId: string;
  readonly timeoutMs?: number;
}

/**
 * ModelProvider 成功結果です。
 */
export interface ModelProviderSuccessResult {
  readonly latencyMs?: number;
  readonly outputText: string;
  readonly outputTokenCount?: number;
  readonly responseDigest?: AgentRawBodyDigest;
  readonly status: 'ok';
}

/**
 * ModelProvider 失敗結果です。
 */
export interface ModelProviderFailureResult {
  readonly category: ModelProviderFailureCategory;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly status: 'error';
}

/**
 * ModelProvider の正規化済み結果です。
 */
export type ModelProviderResult = ModelProviderSuccessResult | ModelProviderFailureResult;

/**
 * Domain/harness から見える pure ModelProvider 境界です。
 */
export interface ModelProvider {
  invoke(request: ModelProviderRequest): Promise<ModelProviderResult>;
}

/**
 * Model output parser の成功結果です。
 */
export interface ParsedModelDecisionOutput {
  readonly decisions: readonly HarnessDecision[];
  readonly safeSummary: string;
}

/**
 * Context bundle を安定順序の model prompt text に変換します。
 *
 * @param bundle immutable Run snapshot から作られた Context Builder bundle です。
 * @returns part order に従って連結した prompt text です。
 */
export function renderHarnessContextPrompt(bundle: HarnessContextBundle): string {
  return bundle.parts
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((part) => `[${part.kind}:${part.status}]\n${part.text}`)
    .join('\n\n');
}

/**
 * Model output を decision schema version `v1` の HarnessDecision[] として parse します。
 *
 * @param input decision schema version と provider output text です。
 * @returns 型検証済み decisions と raw reasoning を含まない summary です。
 * @throws TypeError JSON 破損、schema version 不一致、未知 decision type の場合に発生します。
 */
export function parseModelDecisionOutput(input: {
  readonly decisionSchemaVersion: string;
  readonly outputText: string;
}): ParsedModelDecisionOutput {
  if (input.decisionSchemaVersion !== 'v1') {
    throw new TypeError('unsupported decision schema version');
  }
  const parsed = parseJsonObject(input.outputText);
  const decisions = Array.isArray(parsed) ? parsed : readDecisionArray(parsed);
  const normalized = decisions.map(normalizeDecision);
  return {
    decisions: normalized,
    safeSummary: normalized.map((decision) => `${decision.type}:${decision.decisionId}`).join(','),
  };
}

/**
 * request/response の raw body を保存せず、digest に必要な byte 列だけを生成します。
 */
export function createModelIoBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseJsonObject(outputText: string): unknown {
  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new TypeError('malformed model output');
  }
}

function readDecisionArray(value: unknown): readonly unknown[] {
  if (typeof value !== 'object' || value === null || !('decisions' in value)) {
    throw new TypeError('model output must contain decisions');
  }
  const decisions = (value as { readonly decisions?: unknown }).decisions;
  if (!Array.isArray(decisions)) throw new TypeError('decisions must be an array');
  return decisions;
}

function normalizeDecision(value: unknown): HarnessDecision {
  if (typeof value !== 'object' || value === null) throw new TypeError('decision must be object');
  const decision = value as Partial<Record<string, unknown>>;
  const type = decision.type;
  const decisionId = decision.decisionId;
  if (typeof type !== 'string' || !harnessDecisionTypes.includes(type as HarnessDecision['type'])) {
    throw new TypeError('unsupported decision type');
  }
  if (typeof decisionId !== 'string' || decisionId === '')
    throw new TypeError('decisionId required');
  return requireDecisionFields(type as HarnessDecision['type'], decision, decisionId);
}

function requireDecisionFields(
  type: HarnessDecision['type'],
  decision: Partial<Record<string, unknown>>,
  decisionId: string
): HarnessDecision {
  const rationale = typeof decision.rationale === 'string' ? decision.rationale : undefined;
  switch (type) {
    case 'stop':
      return { decisionId, rationale, reason: readString(decision.reason, 'reason'), type };
    case 'update_state':
      return {
        decisionId,
        rationale,
        statePatchRef: readString(decision.statePatchRef, 'statePatchRef'),
        type,
      };
    case 'write_memory':
      return {
        decisionId,
        memoryScope: decision.memoryScope === 'agent' ? 'agent' : 'thread',
        operationRef: readString(decision.operationRef, 'operationRef'),
        rationale,
        type,
      };
    case 'create_schedule':
      return {
        decisionId,
        rationale,
        scheduleRequestRef: readString(decision.scheduleRequestRef, 'scheduleRequestRef'),
        type,
      };
    case 'invoke_tool':
      return {
        decisionId,
        integrationId:
          typeof decision.integrationId === 'string' ? decision.integrationId : undefined,
        rationale,
        toolId: readString(decision.toolId, 'toolId'),
        toolInputRef: readString(decision.toolInputRef, 'toolInputRef'),
        type,
      };
    case 'respond':
      return {
        decisionId,
        deliveryContextId: readString(decision.deliveryContextId, 'deliveryContextId'),
        rationale,
        responseRef: readString(decision.responseRef, 'responseRef'),
        type,
      };
    case 'request_human_approval':
      return {
        approvalRef: readString(decision.approvalRef, 'approvalRef'),
        decisionId,
        rationale,
        type,
      };
    case 'emit_event':
      return {
        decisionId,
        eventPayloadRef:
          typeof decision.eventPayloadRef === 'string' ? decision.eventPayloadRef : undefined,
        eventType: readString(decision.eventType, 'eventType'),
        rationale,
        type,
      };
  }
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} required`);
  return value;
}
