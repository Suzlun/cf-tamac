import { z } from 'zod';

/**
 * Integration install form で validation summary と focus 移動に使う field 順序です。
 *
 * @remarks
 * `react-hook-form` の invalid submit で最初に知らせる field を固定し、operator が wireframe と同じ順序で
 * 入力を修正できるようにします。任意の `idempotencyKey` は required error を持たないため含めません。
 *
 * @example
 * ```ts
 * const firstField = INTEGRATION_INSTALL_FIELD_ORDER[0];
 * ```
 */
export const INTEGRATION_INSTALL_FIELD_ORDER = [
  'integrationId',
  'manifestUrl',
  'requestedGrants',
] as const;

/**
 * Integration install form で field-level error を持つ入力名です。
 *
 * @remarks
 * `react-hook-form` の `setFocus` と error summary へ渡す安全な field 名として使います。
 * この型は DOM 操作や Agent RPC 呼び出しを行わず、compile-time の取り違えを防ぐためのものです。
 */
export type IntegrationInstallFieldName = (typeof INTEGRATION_INSTALL_FIELD_ORDER)[number];

/**
 * Integration install form の inline validation message 群です。
 *
 * @remarks
 * Client-side validation は operator の即時 feedback 用であり、manifest identity、署名、policy、grant acceptance
 * の最終判定は Server Action 経由の Agent RPC/domain validation が担当します。秘密値、Agent RPC metadata、
 * Adapter Connection の credential material は含めません。
 */
export interface IntegrationInstallFieldErrors {
  readonly integrationId?: string;
  readonly manifestUrl?: string;
  readonly requestedGrants?: string;
}

/**
 * Integration install form の入力を検査する Zod schema です。
 *
 * @remarks
 * wireframe §6.8 と §9.3 の current Agent RPC contract に合わせ、`integrationId`、HTTPS の `manifestUrl`、
 * 非空の parsed `requestedGrants`、任意の `idempotencyKey` だけを扱います。manifest digest 入力は current
 * Agent RPC request に存在しないため schema に含めません。schema は network fetch や Agent RPC 呼び出しを
 * 行わず、Client-side affordance として field-level issue を返します。
 *
 * @example
 * ```ts
 * const result = integrationInstallSchema.safeParse({
 *   integrationId: 'intake-integ',
 *   manifestUrl: 'https://provider.example/.well-known/manifest.json',
 *   requestedGrants: 'events.publish\ntool.invoke',
 *   idempotencyKey: '',
 * });
 * ```
 */
export const integrationInstallSchema = z.object({
  integrationId: z
    .string()
    .trim()
    .min(1, 'Integration ID is required and must match the manifest identity.'),
  manifestUrl: z
    .string()
    .trim()
    .refine(isValidHttpsUrl, 'Manifest URL must be a valid https:// URL.'),
  requestedGrants: z
    .string()
    .refine(
      (value) => parseRequestedGrantList(value).length > 0,
      'Add at least one requested grant before installing.'
    ),
  idempotencyKey: z.string().trim(),
});

/**
 * Integration install form が保持し、Server Action wrapper へ渡す入力値です。
 *
 * @remarks
 * `integrationInstallSchema` から導出し、UI field・validation・mutation helper の型を一つに揃えます。
 * `requestedGrants` は textarea の raw text として保持し、submit 直前に newline/comma separated token へ変換します。
 */
export type IntegrationInstallValues = z.infer<typeof integrationInstallSchema>;

/**
 * Integration install form の初期値を作ります。
 *
 * @returns `react-hook-form` の `defaultValues` として利用できる空の Integration install 入力。
 * @remarks
 * 副作用はありません。idempotency key は空欄のまま保持し、Server Action 呼び出し直前に helper が生成します。
 *
 * @example
 * ```ts
 * const defaultValues = buildInitialIntegrationInstallValues();
 * ```
 */
export function buildInitialIntegrationInstallValues(): IntegrationInstallValues {
  return {
    integrationId: '',
    manifestUrl: '',
    requestedGrants: '',
    idempotencyKey: '',
  };
}

/**
 * Integration install 入力を Agent RPC contract に渡す前の正規化済み値へ整えます。
 *
 * @param values - Browser form が保持している Integration install 入力。
 * @returns trim 済み Integration ID、manifest URL、idempotency key と raw requested grants text。
 * @remarks
 * `requestedGrants` は parse step で重複排除するため raw text を維持します。秘密値や Agent RPC client は扱いません。
 *
 * @example
 * ```ts
 * const normalized = normalizeIntegrationInstallValues(values);
 * ```
 */
export function normalizeIntegrationInstallValues(
  values: IntegrationInstallValues
): IntegrationInstallValues {
  // requestedGrants は newline/comma tokenization 前の textarea 値として保持し、parse step で重複排除する。
  return {
    integrationId: values.integrationId.trim(),
    manifestUrl: values.manifestUrl.trim(),
    requestedGrants: values.requestedGrants,
    idempotencyKey: values.idempotencyKey.trim(),
  };
}

/**
 * Integration install 入力を Zod schema で検査し、field-level message に変換します。
 *
 * @param values - 正規化済みまたは未正規化の Integration install 入力。
 * @returns field ごとの validation message。message がない field は `undefined` になります。
 * @remarks
 * form component では `zodResolver` が同じ schema を使います。この helper は mutation helper や文字列ベースの
 * regression test が schema と同じ rule を参照できるようにするための薄い wrapper です。
 *
 * @example
 * ```ts
 * const errors = validateIntegrationInstallValues(values);
 * ```
 */
export function validateIntegrationInstallValues(
  values: IntegrationInstallValues
): IntegrationInstallFieldErrors {
  const result = integrationInstallSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  return zodErrorToIntegrationInstallErrors(result.error);
}

/**
 * Integration install validation の最初の message を field order に従って返します。
 *
 * @param errors - `validateIntegrationInstallValues` または `react-hook-form` 由来の validation message 群。
 * @returns 最初に form-level summary へ表示すべき message。error がない場合は `undefined`。
 * @remarks
 * UI は field-level `FormMessage` と同時に summary でも同じ代表 message を読み上げ、operator を最初の修正箇所へ誘導します。
 */
export function firstIntegrationInstallErrorMessage(
  errors: IntegrationInstallFieldErrors
): string | undefined {
  // wireframe の field order に合わせ、summary/readout へ出す代表 message を選ぶ。
  return errors.integrationId ?? errors.manifestUrl ?? errors.requestedGrants;
}

/**
 * requested grants textarea を Agent RPC の `requestedGrants` 配列へ変換します。
 *
 * @param rawValue - newline または comma separated の grant 入力。
 * @returns 空白と重複を取り除いた grant 配列。最初に現れた順序を保持します。
 * @remarks
 * 空入力の場合は空配列を返します。呼び出し側は空配列を mutation に渡さず、schema/domain validation に失敗させます。
 *
 * @example
 * ```ts
 * parseRequestedGrantList('events.publish, tool.invoke');
 * // => ['events.publish', 'tool.invoke']
 * ```
 */
export function parseRequestedGrantList(rawValue: string): readonly string[] {
  // newline/comma separated grants を重複排除し、Agent RPC の requestedGrants array として送る。
  const seen = new Set<string>();
  const grants: string[] = [];
  for (const token of rawValue.split(/[\n,]/u)) {
    const grant = token.trim();
    if (grant !== '' && !seen.has(grant)) {
      seen.add(grant);
      grants.push(grant);
    }
  }
  return grants;
}

function zodErrorToIntegrationInstallErrors(error: z.ZodError): IntegrationInstallFieldErrors {
  const errors: WritableIntegrationInstallFieldErrors = {};
  for (const issue of error.issues) {
    const fieldName = issue.path[0];
    if (isIntegrationInstallFieldName(fieldName)) {
      setIntegrationInstallFieldError(errors, fieldName, issue.message);
    }
  }
  return errors;
}

interface WritableIntegrationInstallFieldErrors {
  integrationId?: string;
  manifestUrl?: string;
  requestedGrants?: string;
}

function setIntegrationInstallFieldError(
  errors: WritableIntegrationInstallFieldErrors,
  fieldName: IntegrationInstallFieldName,
  message: string
): void {
  // 同じ field に複数 issue がある場合は、operator に最初の原因だけを示して修正負荷を下げる。
  if (fieldName === 'integrationId' && errors.integrationId === undefined) {
    errors.integrationId = message;
  }
  if (fieldName === 'manifestUrl' && errors.manifestUrl === undefined) {
    errors.manifestUrl = message;
  }
  if (fieldName === 'requestedGrants' && errors.requestedGrants === undefined) {
    errors.requestedGrants = message;
  }
}

function isIntegrationInstallFieldName(
  fieldName: unknown
): fieldName is IntegrationInstallFieldName {
  return (
    typeof fieldName === 'string' &&
    INTEGRATION_INSTALL_FIELD_ORDER.includes(fieldName as IntegrationInstallFieldName)
  );
}

function isValidHttpsUrl(value: string): boolean {
  // URL parser で scheme と host を検証し、`https://` だけの不完全な URL を拒否する。
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}
