import type {
  AgentModelPolicyGenerationParametersRecord,
  AgentModelPolicyInputRecord,
  AgentModelPolicyPayloadRefInput,
  AgentModelPolicyValidationIssueRecord,
} from './model-policy-repository';

/**
 * Model policy generation parameter 読み取り結果です。
 *
 * @remarks
 * Agent RPC payload の inline safe JSON から抽出した数値設定と、Agent 側 validation issue を同時に返します。
 * Provider credential、raw prompt、raw completion、hidden reasoning は入力・出力のどちらにも含めません。
 *
 * @example
 * ```ts
 * const result = readAgentModelPolicyGenerationParameters(policy);
 * if (result.issues.length === 0) use(result.parameters.maxOutputTokens);
 * ```
 */
export interface ReadAgentModelPolicyGenerationParametersResult {
  readonly issues: readonly AgentModelPolicyValidationIssueRecord[];
  readonly parameters: AgentModelPolicyGenerationParametersRecord;
}

/**
 * Model policy input から Workers AI generation parameter を安全に抽出します。
 *
 * @param policy - AgentModelPolicyService が受け取った secret-free policy 入力です。
 * @returns 範囲検証済みの数値設定と validation issue です。
 * @remarks
 * `generationParametersRef.inlineBytes` を優先し、存在しない場合は `safeMetadataRef.inlineBytes` の
 * `generationParameters` を読みます。inline bytes が存在しない参照型 metadata は raw body を持たないため、
 * provider default に委ねる空設定として扱います。
 */
export function readAgentModelPolicyGenerationParameters(
  policy: AgentModelPolicyInputRecord
): ReadAgentModelPolicyGenerationParametersResult {
  const issues: AgentModelPolicyValidationIssueRecord[] = [];
  const source = readGenerationParameterSource(policy);
  if (source === undefined) return { issues, parameters: {} };
  const temperature = readBoundedGenerationNumber(source.temperature, {
    fieldLabel: 'temperature',
    maximum: 2,
    minimum: 0,
    target: 'generation_parameters.temperature',
  });
  const topP = readBoundedGenerationNumber(source.topP, {
    fieldLabel: 'top_p',
    maximum: 1,
    minimum: 0.01,
    target: 'generation_parameters.top_p',
  });
  const maxOutputTokens = readBoundedGenerationInteger(source.maxOutputTokens, {
    fieldLabel: 'max_output_tokens',
    maximum: 8192,
    minimum: 1,
    target: 'generation_parameters.max_output_tokens',
  });
  issues.push(...temperature.issues, ...topP.issues, ...maxOutputTokens.issues);
  return {
    issues,
    parameters: {
      maxOutputTokens: maxOutputTokens.value,
      temperature: temperature.value,
      topP: topP.value,
    },
  };
}

/**
 * SQLite text column に保存する generation parameter 文字列へ正規化します。
 *
 * @param value - Agent 側で範囲検証済みの数値、または未指定です。
 * @returns 未指定なら `null`、指定済みなら JavaScript 標準表記の数値文字列です。
 */
export function formatAgentModelPolicyGenerationNumber(value: number | undefined): string | null {
  return value === undefined ? null : value.toString();
}

function readGenerationParameterSource(
  policy: AgentModelPolicyInputRecord
): Record<string, unknown> | undefined {
  const directPayload = readInlineJsonObject(policy.generationParametersRef);
  if (directPayload !== undefined) return directPayload;
  const safeMetadataPayload = readInlineJsonObject(policy.safeMetadataRef);
  return readRecord(safeMetadataPayload?.generationParameters);
}

function readInlineJsonObject(
  ref: AgentModelPolicyPayloadRefInput | undefined
): Record<string, unknown> | undefined {
  if (ref?.inlineBytes === undefined) return undefined;
  try {
    return readRecord(JSON.parse(new TextDecoder().decode(ref.inlineBytes)) as unknown);
  } catch {
    return undefined;
  }
}

function readBoundedGenerationNumber(
  value: unknown,
  input: {
    readonly fieldLabel: string;
    readonly maximum: number;
    readonly minimum: number;
    readonly target: string;
  }
): {
  readonly issues: readonly AgentModelPolicyValidationIssueRecord[];
  readonly value?: number;
} {
  if (value === undefined) return { issues: [] };
  const parsed = parseGenerationNumber(value);
  if (parsed === undefined || parsed < input.minimum || parsed > input.maximum) {
    return {
      issues: [
        createIssue(
          'invalid_generation_parameter',
          `${input.fieldLabel} must be between ${input.minimum.toString()} and ${input.maximum.toString()}.`,
          input.target
        ),
      ],
    };
  }
  return { issues: [], value: parsed };
}

function readBoundedGenerationInteger(
  value: unknown,
  input: {
    readonly fieldLabel: string;
    readonly maximum: number;
    readonly minimum: number;
    readonly target: string;
  }
): {
  readonly issues: readonly AgentModelPolicyValidationIssueRecord[];
  readonly value?: number;
} {
  const result = readBoundedGenerationNumber(value, input);
  if (result.value === undefined || Number.isInteger(result.value)) return result;
  return {
    issues: [
      createIssue(
        'invalid_generation_parameter',
        `${input.fieldLabel} must be an integer.`,
        input.target
      ),
    ],
  };
}

function parseGenerationNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createIssue(
  code: string,
  safeMessage: string,
  target: string
): AgentModelPolicyValidationIssueRecord {
  return { code, retryable: false, safeMessage, severity: 'error', target };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
