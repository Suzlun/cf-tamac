import { z } from 'zod';

import {
  MODEL_POLICY_FIELD_ORDER,
  modelPolicyDraftSchema,
  type ModelPolicyDraftValues,
} from './model-policy';

const CONFIG_JSON_REQUIRED_MESSAGE = 'Config JSON is required.';
const CONFIG_JSON_PARSE_MESSAGE = 'Config must be valid JSON.';
const CONFIG_JSON_OBJECT_MESSAGE = 'Config must be a JSON object.';
const CREDENTIAL_REFERENCE_REQUIRED_MESSAGE = 'Credential reference is required.';
const KEY_ID_REQUIRED_MESSAGE = 'Key ID is required.';
const FINGERPRINT_REQUIRED_MESSAGE = 'Public fingerprint is required.';
const MASKED_HINT_REQUIRED_MESSAGE = 'Masked hint is required.';
const DESTROY_CONFIRM_REQUIRED_MESSAGE = 'Type the Agent ID to confirm destruction.';
const DESTROY_CONFIRM_MATCH_MESSAGE = 'Type the Agent ID exactly to confirm destruction.';

/**
 * Agent settings の config form が validation summary と focus 制御に使う field 順序です。
 *
 * @remarks
 * config editor は単一 textarea ですが、`react-hook-form` の invalid submit と test が同じ field 名を参照できるように
 * 配列として定義します。この値は DOM、network、Server Action を呼ばず、Browser-safe な validation 補助だけに使います。
 *
 * @example
 * ```ts
 * const firstField = AGENT_CONFIG_FIELD_ORDER[0];
 * ```
 */
export const AGENT_CONFIG_FIELD_ORDER = ['configJson'] as const;

/**
 * Agent config form が扱う field 名です。
 *
 * @remarks
 * `AGENT_CONFIG_FIELD_ORDER` から導出し、schema、focus helper、form component の field 名を一致させます。
 * 値は `configJson` のみで、Agent RPC client や credential material は含みません。
 */
export type AgentConfigFieldName = (typeof AGENT_CONFIG_FIELD_ORDER)[number];

/**
 * Settings の default model policy editor が validation summary と focus 制御に使う field 順序です。
 *
 * @remarks
 * `ModelPolicyFields` と Server Action result の field 名を同じ順序へ揃え、policy ref から
 * max output tokens までを keyboard user が predictable に修正できるようにします。
 */
export const SETTINGS_MODEL_POLICY_FIELD_ORDER = MODEL_POLICY_FIELD_ORDER;

/**
 * Settings 画面の default model policy editor が扱う draft 値です。
 *
 * @remarks
 * Browser には provider/model/generation parameter の安全な draft だけを保持し、Agent RPC
 * client や credential material は含めません。
 */
export type SettingsModelPolicyValues = ModelPolicyDraftValues;

/**
 * Settings 画面の default model policy editor 用 Zod schema です。
 *
 * @remarks
 * 実体は shared model policy schema で、Settings と Registration の validation rule を同じ
 * browser-safe contract に揃えます。最終保存可否は server-side Agent RPC が判定します。
 */
export const settingsModelPolicySchema = modelPolicyDraftSchema;

/**
 * credential reference 保存 form が validation summary と focus 制御に使う field 順序です。
 *
 * @remarks
 * rotation 後に operator が入力する reference metadata の順序を固定します。secret 本体はこの form に存在せず、
 * Server Action へ渡す値も lookup reference、key ID、fingerprint、masked hint の browser-safe metadata だけです。
 *
 * @example
 * ```ts
 * for (const fieldName of CREDENTIAL_REFERENCE_FIELD_ORDER) {
 *   // fieldName の順に最初の validation error を探す。
 * }
 * ```
 */
export const CREDENTIAL_REFERENCE_FIELD_ORDER = [
  'referenceValue',
  'keyId',
  'fingerprintValue',
  'maskedHint',
] as const;

/**
 * credential reference 保存 form が扱う field 名です。
 *
 * @remarks
 * `fingerprintValue` は browser-visible component が server repository の `publicFingerprint` property 名を直接持たないための
 * UI field 名です。submit 時に親 Server Action wrapper が browser-safe payload として変換します。
 */
export type CredentialReferenceFieldName = (typeof CREDENTIAL_REFERENCE_FIELD_ORDER)[number];

/**
 * destroy confirmation form が validation summary と focus 制御に使う field 順序です。
 *
 * @remarks
 * Agent 破壊操作は type-to-confirm の単一 field だけで送信可否を決めます。field 名を配列で持つことで、
 * `react-hook-form` の invalid state と dialog confirmation の focus 移動を同じ順序へ揃えます。
 */
export const DESTROY_CONFIRM_FIELD_ORDER = ['confirmAgentId'] as const;

/**
 * destroy confirmation form が扱う field 名です。
 *
 * @remarks
 * `DESTROY_CONFIRM_FIELD_ORDER` から導出し、dialog 内 input と Zod schema の取り違えを防ぎます。
 */
export type DestroyConfirmFieldName = (typeof DESTROY_CONFIRM_FIELD_ORDER)[number];

const destroyConfirmBaseSchema = z.object({
  confirmAgentId: z.string().min(1, DESTROY_CONFIRM_REQUIRED_MESSAGE),
});

/**
 * Agent config JSON textarea の入力値を検査する Zod schema です。
 *
 * @remarks
 * Client-side validation は operator への即時 feedback のためだけに行います。最終的な config update の可否は
 * Server Action と Agent domain validation が判定します。schema は JSON が parse でき、かつ object であることだけを確認し、
 * Agent RPC client、credential、transport を生成しません。
 *
 * @example
 * ```ts
 * const result = agentConfigSchema.safeParse({ configJson: '{"temperature":0.2}' });
 * ```
 */
export const agentConfigSchema = z.object({
  configJson: z
    .string()
    .trim()
    .min(1, CONFIG_JSON_REQUIRED_MESSAGE)
    .superRefine((value, context) => {
      // textarea の文字列を validation 用にだけ parse し、submit 前の user feedback を field error に閉じる。
      const parsed = safeParseJson(value);
      if (!parsed.ok) {
        context.addIssue({ code: 'custom', message: CONFIG_JSON_PARSE_MESSAGE });
        return;
      }
      // Agent config は object として Server Action へ渡すため、配列/null/primitive を Client side でも早期に案内する。
      if (!isRecordLike(parsed.value)) {
        context.addIssue({ code: 'custom', message: CONFIG_JSON_OBJECT_MESSAGE });
      }
    }),
});

/**
 * Agent config update form が保持する入力値です。
 *
 * @remarks
 * `agentConfigSchema` から導出し、textarea の raw JSON 文字列を保持します。parse 後の object は submit 直前に
 * `parseAgentConfigJson` で作り、browser state に Agent domain snapshot を永続化しません。
 */
export type AgentConfigValues = z.infer<typeof agentConfigSchema>;

/**
 * credential rotation 後に保存する reference metadata を検査する Zod schema です。
 *
 * @remarks
 * reference、key ID、public fingerprint 表示値、masked hint が空でないことを確認します。平文 secret、private key、
 * Agent RPC credential は入力値にも schema にも含めません。Server Action が最終的な保存可否を判定します。
 *
 * @example
 * ```ts
 * const result = credentialLookupSchema.safeParse({
 *   referenceValue: 'wrangler-secret:agent-alpha',
 *   keyId: 'key-2026-06',
 *   fingerprintValue: 'sha256:abc123',
 *   maskedHint: 'ed25519:ab…12',
 * });
 * ```
 */
export const credentialLookupSchema = z.object({
  referenceValue: z
    .string()
    .trim()
    .min(1, CREDENTIAL_REFERENCE_REQUIRED_MESSAGE)
    .max(512, CREDENTIAL_REFERENCE_REQUIRED_MESSAGE),
  keyId: z.string().trim().min(1, KEY_ID_REQUIRED_MESSAGE).max(128, KEY_ID_REQUIRED_MESSAGE),
  fingerprintValue: z
    .string()
    .trim()
    .min(1, FINGERPRINT_REQUIRED_MESSAGE)
    .max(128, FINGERPRINT_REQUIRED_MESSAGE),
  maskedHint: z
    .string()
    .trim()
    .min(1, MASKED_HINT_REQUIRED_MESSAGE)
    .max(64, MASKED_HINT_REQUIRED_MESSAGE),
});

/**
 * credential reference form が保持する入力値です。
 *
 * @remarks
 * `credentialLookupSchema` から導出します。保存時は Server Action wrapper に渡され、Client D1 には reference metadata だけが
 * 保存されます。秘密値や direct Agent RPC 呼び出し情報は含みません。
 */
export type CredentialReferenceValues = z.infer<typeof credentialLookupSchema>;

/**
 * destroy confirmation form が保持する入力値です。
 *
 * @remarks
 * operator が入力した Agent ID echo だけを保持します。破壊操作の reason や idempotency key は browser form からではなく、
 * dialog confirmation handler が Server Action 呼び出し直前に組み立てます。
 */
export type DestroyConfirmValues = z.infer<typeof destroyConfirmBaseSchema>;

/**
 * credential reference form の初期値を作ります。
 *
 * @returns 空の credential reference metadata。`react-hook-form` の `defaultValues` として利用します。
 * @remarks
 * 副作用はありません。rotation 成功後の form reset と初期表示で同じ空値を使い、古い metadata が新しい generation に混ざらないようにします。
 *
 * @example
 * ```ts
 * const defaultValues = buildInitialCredentialReferenceValues();
 * ```
 */
export function buildInitialCredentialReferenceValues(): CredentialReferenceValues {
  return {
    referenceValue: '',
    keyId: '',
    fingerprintValue: '',
    maskedHint: '',
  };
}

/**
 * Agent ID の type-to-confirm validation を行う Zod schema を作ります。
 *
 * @param agentId - dialog が破壊対象として表示している Agent ID です。この値と入力が完全一致した場合だけ submit を許可します。
 * @returns `confirmAgentId` field を持つ destroy confirmation schema です。
 * @remarks
 * schema factory にすることで、route ごとの Agent ID を validation rule に閉じ込めます。Agent 破壊 Server Action は呼ばず、
 * dialog 内での submit 可否と field-level error 表示だけを担当します。
 *
 * @example
 * ```ts
 * const schema = buildDestroyConfirmSchema('agent-alpha');
 * schema.safeParse({ confirmAgentId: 'agent-alpha' });
 * ```
 */
export function buildDestroyConfirmSchema(agentId: string) {
  return destroyConfirmBaseSchema.refine((values) => values.confirmAgentId === agentId, {
    path: ['confirmAgentId'],
    message: DESTROY_CONFIRM_MATCH_MESSAGE,
  });
}

/**
 * config JSON textarea の値を Agent RPC input 用の object に変換します。
 *
 * @param configJson - `agentConfigSchema` で検査済みの JSON 文字列です。
 * @returns Agent config update Server Action に渡す plain object です。
 * @throws JSON として parse できない場合、または JSON object ではない場合に `TypeError` を投げます。
 * @remarks
 * submit handler でも再度 parse して、UI validation を迂回した呼び出しを安全に止めます。この関数は network や D1 への副作用を持ちません。
 *
 * @example
 * ```ts
 * const config = parseAgentConfigJson('{"enabled":true}');
 * ```
 */
export function parseAgentConfigJson(configJson: string): Record<string, unknown> {
  // Server Action へ渡す直前に parse し、browser state には JSON 文字列だけを保持する。
  const parsed = safeParseJson(configJson);
  if (!parsed.ok) {
    throw new TypeError(CONFIG_JSON_PARSE_MESSAGE);
  }
  // Agent config RPC は object を期待するため、JSON array/null/primitive を明示的に拒否する。
  if (!isRecordLike(parsed.value)) {
    throw new TypeError(CONFIG_JSON_OBJECT_MESSAGE);
  }
  return parsed.value;
}

function safeParseJson(
  value: string
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
