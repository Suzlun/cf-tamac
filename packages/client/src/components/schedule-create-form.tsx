'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldErrors, type UseFormReturn, useForm } from 'react-hook-form';

import { generateIdempotencyKey } from './generate-idempotency-key';
import {
  buildInitialScheduleCreateValues,
  buildScheduleSpec,
  scheduleCreateSchema,
  type ScheduleCreateValues,
} from './schemas/schedule-create';
import { Button } from './ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField as RhfFormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Select } from './ui/select';

interface ThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
}

interface ScheduleCreateFormProps {
  readonly threads: readonly ThreadSummary[];
  readonly pending: boolean;
  readonly onCreate: (
    idempotencyKey: string,
    threadId: string,
    scheduleSpec: string,
    overlapPolicy: string
  ) => Promise<void>;
  readonly onCancel: () => void;
  readonly onError: (message: string) => void;
}

/**
 * Schedule 作成用の折りたたみ form panel を表示します。
 *
 * @param threads - Schedule の送信先として選べる Browser-safe Thread 一覧です。空の場合は Thread field が選択不能になります。
 * @param pending - 親 component が Server Action 実行中であることを示す flag です。`true` の間は submit と入力を無効化します。
 * @param onCreate - Zod validation を通過した idempotency key、Thread、schedule spec、overlap policy を親へ渡す callback です。
 * @param onCancel - Cancel button が押されたことを親へ通知し、親が panel を閉じるための callback です。
 * @param onError - invalid submit の代表 message を親の safe error readout へ通知する callback です。
 * @returns Thread context、trigger type、overlap policy、idempotency key を入力する shadcn Form composition を返します。
 *
 * @remarks
 * この component は `react-hook-form` と `zodResolver(scheduleCreateSchema)` を使って Client-side validation を行います。
 * Browser では Agent RPC client や credential を作らず、submit 成功時も親から渡された Server Action wrapper だけに委譲します。
 * error は `FormMessage` と親 readout の両方で提示し、invalid submit では最初の invalid field に focus します。
 *
 * @example
 * ```tsx
 * <ScheduleCreateForm
 *   threads={[{ threadId: 'thread_01', threadKey: 'support' }]}
 *   pending={false}
 *   onCreate={createScheduleDraft}
 *   onCancel={hideCreatePanel}
 *   onError={setSafeError}
 * />
 * ```
 */
export function ScheduleCreateForm({
  threads,
  pending,
  onCreate,
  onCancel,
  onError,
}: ScheduleCreateFormProps) {
  const form = useForm<ScheduleCreateValues>({
    resolver: zodResolver(scheduleCreateSchema),
    defaultValues: buildInitialScheduleCreateValues(generateIdempotencyKey()),
    mode: 'onChange',
    shouldFocusError: true,
  });
  const triggerType = form.watch('type');

  const handleValidSubmit = async (values: ScheduleCreateValues): Promise<void> => {
    // valid submit だけを親の Server Action wrapper へ渡し、browser では Agent RPC を直接構築しない。
    form.clearErrors();
    await onCreate(
      resolveScheduleIdempotencyKey(values),
      values.threadId,
      buildScheduleSpec(values),
      values.overlapPolicy
    );
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<ScheduleCreateValues>): void => {
    // invalid submit は代表 message を親 readout に出し、field-level error は shadcn FormMessage に任せる。
    const validationMessage = firstScheduleValidationError(fieldErrors);
    if (validationMessage !== undefined) {
      onError(validationMessage);
    }
    focusFirstInvalidScheduleField(form, fieldErrors);
  };

  return (
    <div className="readout">
      <Form {...form}>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
          }}
          noValidate
        >
          <ScheduleFormFields
            form={form}
            threads={threads}
            pending={pending}
            triggerType={triggerType}
          />
          <div className="action-row">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={pending} aria-disabled={pending}>
              {pending ? 'Creating…' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

interface ScheduleFormFieldsProps {
  readonly form: UseFormReturn<ScheduleCreateValues>;
  readonly threads: readonly ThreadSummary[];
  readonly pending: boolean;
  readonly triggerType: ScheduleCreateValues['type'];
}

function ScheduleFormFields({ form, threads, pending, triggerType }: ScheduleFormFieldsProps) {
  return (
    <>
      <ScheduleThreadField form={form} threads={threads} pending={pending} />
      <ScheduleTypeField form={form} pending={pending} />
      <ScheduleTriggerDetailField form={form} triggerType={triggerType} pending={pending} />
      <ScheduleOverlapField form={form} pending={pending} />
      <ScheduleIdempotencyField form={form} pending={pending} />
    </>
  );
}

function ScheduleThreadField({
  form,
  threads,
  pending,
}: Pick<ScheduleFormFieldsProps, 'form' | 'threads' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="threadId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Thread</FormLabel>
          <FormDescription>
            Schedule fires a schedule.triggered Event into this Thread.
          </FormDescription>
          <FormControl>
            <Select {...field} disabled={pending} required aria-label="Target Thread">
              <option value="">— select —</option>
              {threads.map((thread) => (
                <option key={thread.threadId} value={thread.threadId}>
                  {thread.threadKey}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScheduleTypeField({ form, pending }: Pick<ScheduleFormFieldsProps, 'form' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="type"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Trigger type</FormLabel>
          <FormControl>
            <Select
              {...field}
              disabled={pending}
              onChange={(event) => {
                // trigger type 変更時は非表示 field の古い error を消し、表示中 field の修正に集中させる。
                field.onChange(event);
                form.clearErrors(['fireAt', 'intervalSeconds']);
              }}
            >
              <option value="one-shot">one-shot</option>
              <option value="interval">interval</option>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScheduleTriggerDetailField({
  form,
  triggerType,
  pending,
}: Pick<ScheduleFormFieldsProps, 'form' | 'triggerType' | 'pending'>) {
  if (triggerType === 'one-shot') {
    return <ScheduleFireAtField form={form} pending={pending} />;
  }
  return <ScheduleIntervalField form={form} pending={pending} />;
}

function ScheduleFireAtField({ form, pending }: Pick<ScheduleFormFieldsProps, 'form' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="fireAt"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Fire at</FormLabel>
          <FormControl>
            <Input {...field} type="datetime-local" disabled={pending} required />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScheduleIntervalField({
  form,
  pending,
}: Pick<ScheduleFormFieldsProps, 'form' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="intervalSeconds"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Interval seconds</FormLabel>
          <FormControl>
            <Input {...field} type="number" disabled={pending} required min={1} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScheduleOverlapField({
  form,
  pending,
}: Pick<ScheduleFormFieldsProps, 'form' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="overlapPolicy"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Overlap policy</FormLabel>
          <FormDescription>
            skip: ignore if prior callback active. coalesce: merge into pending Run. queue-next:
            enqueue a separate Run.
          </FormDescription>
          <FormControl>
            <Select {...field} disabled={pending}>
              <option value="skip">skip</option>
              <option value="coalesce">coalesce</option>
              <option value="queue-next">queue-next</option>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScheduleIdempotencyField({
  form,
  pending,
}: Pick<ScheduleFormFieldsProps, 'form' | 'pending'>) {
  return (
    <RhfFormField
      control={form.control}
      name="idempotencyKey"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Idempotency key</FormLabel>
          <FormDescription>
            Optional. A new key is generated automatically when this field is blank.
          </FormDescription>
          <FormControl>
            <Input {...field} disabled={pending} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function resolveScheduleIdempotencyKey(values: ScheduleCreateValues): string {
  // operator 入力が空なら browser-safe idempotency key を生成し、二重 submit の replay 境界を保つ。
  const trimmedKey = values.idempotencyKey.trim();
  return trimmedKey === '' ? generateIdempotencyKey() : trimmedKey;
}

function firstScheduleValidationError(
  fieldErrors: FieldErrors<ScheduleCreateValues>
): string | undefined {
  // 表示順に最初の validation message を親の ErrorAlert/readout にも連携する。
  return (
    readScheduleErrorMessage(fieldErrors, 'threadId') ??
    readScheduleErrorMessage(fieldErrors, 'fireAt') ??
    readScheduleErrorMessage(fieldErrors, 'intervalSeconds')
  );
}

function focusFirstInvalidScheduleField(
  form: UseFormReturn<ScheduleCreateValues>,
  fieldErrors: FieldErrors<ScheduleCreateValues>
): void {
  // react-hook-form の focus API だけを使い、手書き DOM query を増やさず accessibility flow を保つ。
  if (fieldErrors.threadId !== undefined) {
    form.setFocus('threadId');
    return;
  }
  if (fieldErrors.fireAt !== undefined) {
    form.setFocus('fireAt');
    return;
  }
  if (fieldErrors.intervalSeconds !== undefined) {
    form.setFocus('intervalSeconds');
  }
}

function readScheduleErrorMessage(
  fieldErrors: FieldErrors<ScheduleCreateValues>,
  fieldName: 'threadId' | 'fireAt' | 'intervalSeconds'
): string | undefined {
  if (fieldName === 'threadId') return toErrorMessage(fieldErrors.threadId?.message);
  if (fieldName === 'fireAt') return toErrorMessage(fieldErrors.fireAt?.message);
  return toErrorMessage(fieldErrors.intervalSeconds?.message);
}

function toErrorMessage(message: unknown): string | undefined {
  return typeof message === 'string' && message !== '' ? message : undefined;
}
