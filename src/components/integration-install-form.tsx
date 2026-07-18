'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldErrors, type UseFormReturn, useForm } from 'react-hook-form';

import {
  buildInitialIntegrationInstallValues,
  firstIntegrationInstallErrorMessage,
  integrationInstallSchema,
  normalizeIntegrationInstallValues,
  parseRequestedGrantList,
  type IntegrationInstallFieldErrors,
  type IntegrationInstallValues,
} from './schemas/integration-install';
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
import { Textarea } from './ui/textarea';

const INSTALL_VALIDATION_SUMMARY_ID = 'integration-install-validation-summary';

/**
 * Integration install form の入力状態です。
 *
 * @remarks
 * Browser は Integration ID、manifest URL、requested grants、任意 idempotency key だけを保持します。
 * manifest fetch、署名検証、Agent RPC 呼び出しは Server Action と Agent Worker 側に閉じ、credential material や
 * direct Agent RPC transport はこの型に含めません。
 *
 * @example
 * ```ts
 * const draft: InstallFormState = {
 *   integrationId: 'intake-integ',
 *   manifestUrl: 'https://provider.example/manifest.json',
 *   requestedGrants: 'events.publish',
 *   idempotencyKey: '',
 * };
 * ```
 */
export type InstallFormState = IntegrationInstallValues;

interface IntegrationInstallFormProps {
  readonly pending: boolean;
  readonly canInstall: boolean;
  readonly permissionDeniedReason?: string;
  readonly permissionDescriptionId?: string;
  readonly onInstall: (form: InstallFormState) => Promise<void>;
  readonly onCancel: () => void;
  readonly onInvalid?: (message: string) => void;
}

/**
 * Integration install 用の折りたたみ form body を表示します。
 *
 * @param pending - Server Action または confirmation flow 実行中に form controls を無効化する flag です。
 * @param canInstall - server-side permission 判定済みの install 許可 flag です。
 * @param permissionDeniedReason - permission denied 時に表示・参照する browser-safe copy です。
 * @param permissionDescriptionId - permission denied copy の DOM ID です。button の `aria-describedby` へ使います。
 * @param onInstall - Zod validation を通過した Integration install draft を親へ渡す callback です。直接 Agent RPC は呼びません。
 * @param onCancel - Cancel button click を親へ通知し、親が install panel を閉じるための callback です。
 * @param onInvalid - invalid submit の代表 message を親 readout へ同期する任意 callback です。
 * @returns current Agent RPC contract に沿った Integration ID、Manifest URL、Requested grants、Idempotency key の shadcn Form。
 *
 * @remarks
 * `react-hook-form`、`zodResolver(integrationInstallSchema)`、shadcn Form primitives で構成し、wireframe §6.8/§9.3 の
 * current contract を実装します。manifest digest input は current Agent RPC request に存在しないため表示しません。
 * Field-level error は `FormMessage`、summary error は `role="alert"` で読み上げます。requested grants preview は
 * `FormControl` の追加 `aria-describedby` として関連付けます。
 *
 * @example
 * ```tsx
 * <IntegrationInstallForm
 *   pending={false}
 *   onInstall={queueInstallConfirmation}
 *   onCancel={hideInstallPanel}
 *   onInvalid={setSafeError}
 * />
 * ```
 */
export function IntegrationInstallForm({
  pending,
  canInstall,
  permissionDeniedReason,
  permissionDescriptionId,
  onInstall,
  onCancel,
  onInvalid,
}: IntegrationInstallFormProps) {
  const form = useForm<InstallFormState>({
    resolver: zodResolver(integrationInstallSchema),
    defaultValues: buildInitialIntegrationInstallValues(),
    mode: 'onChange',
    shouldFocusError: true,
  });
  const requestedGrantPreview = parseRequestedGrantList(form.watch('requestedGrants'));
  const validationSummary = firstInstallFormErrorMessage(form.formState.errors);
  const installDisabledReason = resolveInstallDisabledReason(
    canInstall,
    permissionDeniedReason,
    pending,
    form.formState.isValid,
    validationSummary
  );
  const isInstallDisabled = installDisabledReason !== undefined;
  const submitDescriptionId = resolveInstallSubmitDescriptionId(
    canInstall,
    permissionDescriptionId,
    installDisabledReason
  );
  const controlsDisabled = pending || !canInstall;

  const handleValidSubmit = async (values: InstallFormState): Promise<void> => {
    // valid submit では draft を正規化し、confirmation dialog を出す親 component にだけ渡す。
    form.clearErrors();
    await onInstall(normalizeIntegrationInstallValues(values));
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<InstallFormState>): void => {
    // react-hook-form の focus 管理を使いながら、親の safe readout にも代表 message を同期する。
    const message = firstInstallFormErrorMessage(fieldErrors);
    if (message !== undefined) {
      onInvalid?.(message);
    }
    focusFirstInvalidInstallField(form, fieldErrors);
  };

  return (
    <div className="rounded-md border bg-card p-4 text-sm space-y-1">
      <Form {...form}>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
          }}
          noValidate
        >
          <InstallValidationSummary
            message={
              validationSummary ??
              (canInstall || permissionDescriptionId === undefined
                ? installDisabledReason
                : undefined)
            }
          />
          <IntegrationInstallFormFields
            form={form}
            pending={controlsDisabled}
            requestedGrantPreview={requestedGrantPreview}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isInstallDisabled}
              aria-disabled={isInstallDisabled}
              aria-describedby={submitDescriptionId}
            >
              {pending ? 'Installing…' : 'Install'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

interface IntegrationInstallFormFieldsProps {
  readonly form: UseFormReturn<InstallFormState>;
  readonly pending: boolean;
  readonly requestedGrantPreview: readonly string[];
}

function IntegrationInstallFormFields({
  form,
  pending,
  requestedGrantPreview,
}: IntegrationInstallFormFieldsProps) {
  return (
    <>
      <RhfFormField
        control={form.control}
        name="integrationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Integration ID</FormLabel>
            <FormDescription>
              Exact integration_id declared by the signed manifest. The Agent rejects the install
              when it does not match.
            </FormDescription>
            <FormControl>
              <Input {...field} disabled={pending} placeholder="intake-integ" required />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <RhfFormField
        control={form.control}
        name="manifestUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Manifest URL</FormLabel>
            <FormDescription>
              HTTPS URL to the signed Integration manifest. The Client sends this as manifest_ref;
              only the Agent Worker fetches and verifies it.
            </FormDescription>
            <FormControl>
              <Input {...field} type="url" disabled={pending} required />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <RhfFormField
        control={form.control}
        name="requestedGrants"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Requested grants</FormLabel>
            <FormDescription>
              One grant per line or comma-separated. Request only grants the operator intends to
              authorize; the Agent validates manifest and policy before installing.
            </FormDescription>
            <FormControl aria-describedby="requestedGrants-preview">
              <Textarea
                {...field}
                disabled={pending}
                placeholder={'events.publish\ntool.invoke\ndelivery.respond'}
                rows={7}
              />
            </FormControl>
            <FormMessage />
            <GrantPreview grants={requestedGrantPreview} />
          </FormItem>
        )}
      />
      <RhfFormField
        control={form.control}
        name="idempotencyKey"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Idempotency key</FormLabel>
            <FormDescription>
              Leave blank to generate a one-time key. Reuse a key only when retrying the exact same
              install command.
            </FormDescription>
            <FormControl>
              <Input {...field} disabled={pending} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

function InstallValidationSummary({ message }: { readonly message?: string }) {
  if (message === undefined) {
    return null;
  }
  return (
    <div
      id={INSTALL_VALIDATION_SUMMARY_ID}
      className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm"
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}

function resolveInstallDisabledReason(
  canInstall: boolean,
  permissionDeniedReason: string | undefined,
  pending: boolean,
  isValid: boolean,
  validationSummary: string | undefined
): string | undefined {
  // permission denied は required field より優先し、Server Action へ進む UI 経路を閉じる。
  if (!canInstall) {
    return permissionDeniedReason ?? 'You do not have permission to manage Integrations.';
  }
  // pending 中は二重 submit を防ぎ、disabled button を状態説明へ関連付ける。
  if (pending) {
    return 'Installation request is pending.';
  }
  // required fields が invalid の間は Server Action に進ませず、summary copy を aria-describedby で参照させる。
  if (!isValid) {
    return (
      validationSummary ??
      'Complete Integration ID, Manifest URL, and Requested grants before installing.'
    );
  }
  return undefined;
}

function resolveInstallSubmitDescriptionId(
  canInstall: boolean,
  permissionDescriptionId: string | undefined,
  installDisabledReason: string | undefined
): string | undefined {
  // permission denied の場合は親が描画する permission copy を参照し、validation summary と混同させない。
  if (!canInstall) {
    return permissionDescriptionId ?? INSTALL_VALIDATION_SUMMARY_ID;
  }
  return installDisabledReason !== undefined ? INSTALL_VALIDATION_SUMMARY_ID : undefined;
}

function GrantPreview({ grants }: { readonly grants: readonly string[] }) {
  return (
    <div
      id="requestedGrants-preview"
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-live="polite"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Requested grants ({grants.length})
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Requested grants preview">
        {grants.map((grant) => (
          <li
            key={grant}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {grant}
          </li>
        ))}
      </ul>
    </div>
  );
}

function firstInstallFormErrorMessage(
  fieldErrors: FieldErrors<InstallFormState>
): string | undefined {
  const errors: IntegrationInstallFieldErrors = {
    integrationId: toErrorMessage(fieldErrors.integrationId?.message),
    manifestUrl: toErrorMessage(fieldErrors.manifestUrl?.message),
    requestedGrants: toErrorMessage(fieldErrors.requestedGrants?.message),
  };
  return firstIntegrationInstallErrorMessage(errors);
}

function focusFirstInvalidInstallField(
  form: UseFormReturn<InstallFormState>,
  fieldErrors: FieldErrors<InstallFormState>
): void {
  // 手書き DOM query を避け、react-hook-form が管理する ref に focus を委譲する。
  if (fieldErrors.integrationId !== undefined) {
    form.setFocus('integrationId');
    return;
  }
  if (fieldErrors.manifestUrl !== undefined) {
    form.setFocus('manifestUrl');
    return;
  }
  if (fieldErrors.requestedGrants !== undefined) {
    form.setFocus('requestedGrants');
  }
}

function toErrorMessage(message: unknown): string | undefined {
  return typeof message === 'string' && message !== '' ? message : undefined;
}
