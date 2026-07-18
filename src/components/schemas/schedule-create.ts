import { z } from 'zod';

/**
 * Schedule 作成 form で validation summary と focus 移動に使う field 順序です。
 *
 * @remarks
 * UI はこの順序で最初の error を読み上げ、`react-hook-form` の `setFocus` へ渡します。
 * `idempotencyKey` は空欄時に自動生成できる任意 field のため、required error の対象外です。
 *
 * @example
 * ```ts
 * for (const fieldName of SCHEDULE_CREATE_FIELD_ORDER) {
 *   // fieldName の順に error summary を組み立てる。
 * }
 * ```
 */
export const SCHEDULE_CREATE_FIELD_ORDER = ['threadId', 'fireAt', 'intervalSeconds'] as const;

/**
 * Schedule 作成 form が validation 対象にする field 名です。
 *
 * @remarks
 * `ScheduleCreateValues` のうち、ユーザーが修正すべき invalid field へ focus するための subset です。
 * 追加の副作用はなく、型安全な field 名として `react-hook-form` に渡します。
 */
export type ScheduleCreateFieldName = (typeof SCHEDULE_CREATE_FIELD_ORDER)[number];

/**
 * Schedule 作成 form の trigger 種別です。
 *
 * @remarks
 * `one-shot` は `fireAt` を必須にし、`interval` は正の `intervalSeconds` を必須にします。
 * Agent RPC へ送る JSON schedule spec の分岐にも同じ値を使います。
 */
export type ScheduleTriggerType = 'one-shot' | 'interval';

/**
 * Schedule 作成 form の overlap policy です。
 *
 * @remarks
 * UI は wireframe の選択肢だけを許可し、Server Action はこの文字列を Agent RPC へ渡します。
 * Agent domain validation が最終判定を行うため、Client schema は operator 補助として機能します。
 */
export type ScheduleOverlapPolicy = 'skip' | 'coalesce' | 'queue-next';

/**
 * Schedule 作成 form の入力を検査する Zod schema です。
 *
 * @remarks
 * `react-hook-form` の resolver として利用し、Thread context、trigger 条件、overlap policy、任意の
 * idempotency key を検査します。Client validation は即時 feedback のための補助であり、Server Action と
 * Agent RPC/domain validation が最終的な source of truth です。schema 自体は DOM 操作や network 呼び出しを
 * 行わず、失敗時は field path 付き Zod issue を返します。
 *
 * @example
 * ```ts
 * const result = scheduleCreateSchema.safeParse({
 *   threadId: 'thread_01',
 *   type: 'one-shot',
 *   fireAt: '2026-06-23T09:00',
 *   intervalSeconds: '',
 *   overlapPolicy: 'skip',
 *   idempotencyKey: '',
 * });
 * ```
 */
export const scheduleCreateSchema = z
  .object({
    threadId: z.string().trim().min(1, 'Thread is required.'),
    type: z.enum(['one-shot', 'interval']),
    fireAt: z.string().trim(),
    intervalSeconds: z.string().trim(),
    overlapPolicy: z.enum(['skip', 'coalesce', 'queue-next']),
    idempotencyKey: z.string().trim(),
  })
  .superRefine((values, context) => {
    // trigger type に応じた必須 field だけを検査し、非表示 field の古い値で operator を止めない。
    if (values.type === 'one-shot' && values.fireAt === '') {
      context.addIssue({
        code: 'custom',
        path: ['fireAt'],
        message: 'Fire at is required.',
      });
    }

    // interval trigger では正の秒数だけを許可し、Agent RPC に不正な interval JSON を渡さない。
    const intervalSeconds = Number(values.intervalSeconds);
    if (
      values.type === 'interval' &&
      (values.intervalSeconds === '' || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['intervalSeconds'],
        message: 'Interval seconds must be a positive number.',
      });
    }
  });

/**
 * Schedule 作成 form が保持し、Server Action wrapper へ渡す入力値です。
 *
 * @remarks
 * `scheduleCreateSchema` から導出されるため、UI field と validation schema の同期を保ちます。
 * `idempotencyKey` は空文字を許容し、submit 時に browser-safe helper で一回限りの key に置き換えます。
 */
export type ScheduleCreateValues = z.infer<typeof scheduleCreateSchema>;

/**
 * Schedule 作成 form の初期値を作ります。
 *
 * @param idempotencyKey - 初期表示時に入力欄へ入れる idempotency key。空文字も指定できます。
 * @returns `react-hook-form` の `defaultValues` として利用できる Schedule 作成値。
 * @remarks
 * DOM や network への副作用はありません。key 生成は caller 側に分離し、schema 層が乱数生成を持たないようにします。
 *
 * @example
 * ```ts
 * const defaultValues = buildInitialScheduleCreateValues(generateIdempotencyKey());
 * ```
 */
export function buildInitialScheduleCreateValues(idempotencyKey: string): ScheduleCreateValues {
  return {
    threadId: '',
    type: 'one-shot',
    fireAt: '',
    intervalSeconds: '',
    overlapPolicy: 'skip',
    idempotencyKey,
  };
}

/**
 * Schedule 作成入力から Agent RPC に渡す JSON schedule spec を生成します。
 *
 * @param values - `scheduleCreateSchema` を通過した Schedule 作成値。
 * @returns `one-shot` または `interval` の Agent schedule spec JSON 文字列。
 * @remarks
 * Browser は Agent RPC client を構築せず、この JSON 文字列を親 component 経由で Server Action に渡します。
 * `intervalSeconds` は数値へ変換しますが、入力値自体の正当性は schema と Agent domain が判定します。
 *
 * @example
 * ```ts
 * const spec = buildScheduleSpec({
 *   threadId: 'thread_01',
 *   type: 'interval',
 *   fireAt: '',
 *   intervalSeconds: '60',
 *   overlapPolicy: 'skip',
 *   idempotencyKey: '',
 * });
 * ```
 */
export function buildScheduleSpec(values: ScheduleCreateValues): string {
  // Agent RPC へ渡す schedule spec は browser-safe form state から最小 JSON として組み立てる。
  return values.type === 'one-shot'
    ? JSON.stringify({ type: 'one-shot', fireAt: values.fireAt })
    : JSON.stringify({ type: 'interval', intervalSeconds: Number(values.intervalSeconds) });
}
