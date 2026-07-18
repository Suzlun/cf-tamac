'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { type FieldErrors, type UseFormReturn, useForm } from 'react-hook-form';

import { ConfirmDialog } from './confirm-dialog';
import {
  buildInitialCredentialReferenceValues,
  credentialLookupSchema,
  type CredentialReferenceFieldName,
  type CredentialReferenceValues,
} from './schemas/agent-settings';
import { SignalBadge } from './signal-badge';
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

type RotateResult = CredentialReferenceValues;

interface CurrentCredentialView {
  readonly status: string;
  readonly keyId?: string;
  readonly generation?: number;
  readonly maskedHint?: string;
}

interface CredentialRotationSectionProps {
  readonly actingOperatorId: string;
  readonly currentCredential?: CurrentCredentialView;
  readonly pending: boolean;
  readonly onRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly onSaveReference: (result: RotateResult) => Promise<boolean>;
}

/**
 * Agent settings 画面の credential rotation section を描画します。
 *
 * @param actingOperatorId - confirmation dialog に表示する browser-safe operator identifier です。scope や credential は含みません。
 * @param currentCredential - Agent RPC から server-side で取得した現在の credential summary です。secret material は含みません。
 * @param pending - 親 settings form が mutation 実行中であることを示す flag です。`true` の間は rotate と保存を止めます。
 * @param onRotate - 明示確認後に credential rotation Server Action wrapper を呼ぶ callback です。Browser は Agent RPC を直接呼びません。
 * @param onSaveReference - rotation 後に operator が入力した reference metadata を保存する callback です。平文 secret は渡しません。
 * @returns 現在 credential summary、rotation confirmation、RHF/Zod reference form を含む section を返します。
 * @remarks
 * reference metadata 入力は `react-hook-form`、`zodResolver(credentialLookupSchema)`、shadcn `Form` primitives で構成します。
 * rotation 成功後だけ保存 form を表示し、古い入力値は `buildInitialCredentialReferenceValues` で必ず reset します。
 *
 * @example
 * ```tsx
 * <CredentialRotationSection
 *   actingOperatorId="operator-1"
 *   pending={false}
 *   onRotate={rotateThroughServerAction}
 *   onSaveReference={saveReferenceThroughServerAction}
 * />
 * ```
 */
export function CredentialRotationSection({
  actingOperatorId,
  currentCredential,
  pending,
  onRotate,
  onSaveReference,
}: CredentialRotationSectionProps) {
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [referenceFormVisible, setReferenceFormVisible] = useState(false);
  const form = useForm<CredentialReferenceValues>({
    resolver: zodResolver(credentialLookupSchema),
    defaultValues: buildInitialCredentialReferenceValues(),
    mode: 'onChange',
    shouldFocusError: true,
  });

  const handleRotate = async (): Promise<void> => {
    // rotation が成功した場合だけ新 generation 用の reference form を空値で開き、古い reference metadata を混ぜない。
    const result = await onRotate();
    if (result !== undefined) {
      form.reset(buildInitialCredentialReferenceValues());
      setReferenceFormVisible(true);
      setRotateDialogOpen(false);
    }
  };

  const handleSaveNewReference = async (values: CredentialReferenceValues): Promise<void> => {
    // Zod validation を通過した browser-safe metadata だけを親 Server Action wrapper へ渡す。
    const saved = await onSaveReference(values);
    if (saved) {
      form.reset(buildInitialCredentialReferenceValues());
      setReferenceFormVisible(false);
    }
  };

  const handleInvalidReference = (fieldErrors: FieldErrors<CredentialReferenceValues>): void => {
    // invalid submit は FormMessage に任せ、最初の invalid field へ focus を戻して修正位置を明確にする。
    focusFirstInvalidCredentialField(form, fieldErrors);
  };

  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="credential-heading"
    >
      <strong id="credential-heading">Credential rotation</strong>
      <CurrentCredentialSummary credential={currentCredential} />
      <Button
        type="button"
        variant="default"
        onClick={() => {
          setRotateDialogOpen(true);
        }}
        disabled={pending}
        aria-disabled={pending}
      >
        Rotate credential
      </Button>
      {referenceFormVisible ? (
        <NewReferenceForm
          form={form}
          pending={pending}
          onSave={handleSaveNewReference}
          onInvalid={handleInvalidReference}
        />
      ) : null}

      <ConfirmDialog
        open={rotateDialogOpen}
        heading="Rotate Agent credential?"
        confirmLabel="Rotate"
        onConfirm={handleRotate}
        onCancel={() => {
          setRotateDialogOpen(false);
        }}
        pending={pending}
      >
        <p>
          A new credential generation will become active. The previous generation remains valid
          during the overlap window.
        </p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
    </section>
  );
}

interface NewReferenceFormProps {
  readonly form: UseFormReturn<CredentialReferenceValues>;
  readonly pending: boolean;
  readonly onSave: (values: CredentialReferenceValues) => Promise<void>;
  readonly onInvalid: (fieldErrors: FieldErrors<CredentialReferenceValues>) => void;
}

function NewReferenceForm({ form, pending, onSave, onInvalid }: NewReferenceFormProps) {
  const saveDisabled = pending || !form.formState.isValid;

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        New reference
      </p>
      <Form {...form}>
        <form
          onSubmit={(event) => {
            // reference 保存は RHF/Zod の validation を通過した時だけ親 callback へ進める。
            void form.handleSubmit(onSave, onInvalid)(event);
          }}
          noValidate
        >
          <CredentialTextField
            form={form}
            name="referenceValue"
            label="New credential reference"
            helper="Opaque lookup reference. Do not enter plaintext secret material."
            disabled={pending}
          />
          <CredentialTextField form={form} name="keyId" label="New key ID" disabled={pending} />
          <CredentialTextField
            form={form}
            name="fingerprintValue"
            label="New public fingerprint"
            disabled={pending}
          />
          <CredentialTextField
            form={form}
            name="maskedHint"
            label="New masked hint"
            disabled={pending}
          />
          <Button
            type="submit"
            variant="default"
            disabled={saveDisabled}
            aria-disabled={saveDisabled}
          >
            Save new reference
          </Button>
        </form>
      </Form>
    </div>
  );
}

interface CredentialTextFieldProps {
  readonly form: UseFormReturn<CredentialReferenceValues>;
  readonly name: CredentialReferenceFieldName;
  readonly label: string;
  readonly helper?: string;
  readonly disabled: boolean;
}

function CredentialTextField({ form, name, label, helper, disabled }: CredentialTextFieldProps) {
  return (
    <RhfFormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {helper !== undefined ? <FormDescription>{helper}</FormDescription> : null}
          <FormControl>
            <Input {...field} disabled={disabled} autoComplete="off" required />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CurrentCredentialSummary({ credential }: { readonly credential?: CurrentCredentialView }) {
  return (
    <div
      className="mb-4 rounded-md border bg-card p-4 text-sm space-y-1"
      aria-label="Current credential"
    >
      <strong>Current credential</strong>
      <p>generation {credential?.generation ?? '—'}</p>
      <div>
        status:{' '}
        <SignalBadge
          label={(credential?.status ?? 'unknown').toUpperCase()}
          variant={credential?.status === 'active' ? 'signal' : 'muted'}
        />
      </div>
      <p>key id: {credential?.keyId ?? '—'}</p>
      <p>masked hint: {credential?.maskedHint ?? '—'}</p>
    </div>
  );
}

function focusFirstInvalidCredentialField(
  form: UseFormReturn<CredentialReferenceValues>,
  fieldErrors: FieldErrors<CredentialReferenceValues>
): void {
  // schema と同じ field order で明示分岐し、動的 property access を避けながら最初の error へ focus する。
  if (fieldErrors.referenceValue !== undefined) {
    form.setFocus('referenceValue');
    return;
  }
  if (fieldErrors.keyId !== undefined) {
    form.setFocus('keyId');
    return;
  }
  if (fieldErrors.fingerprintValue !== undefined) {
    form.setFocus('fingerprintValue');
    return;
  }
  if (fieldErrors.maskedHint !== undefined) {
    form.setFocus('maskedHint');
  }
}
