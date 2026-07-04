'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormReturn } from 'react-hook-form';

import { RegistrationActions } from './agent-registration-actions';
import { ControlRoomFrame } from './control-room-frame';
import {
  buildModelPolicyFieldNames,
  ModelPolicyFields,
  type ModelPolicyValidationStatus,
} from './model-policy-fields';
import {
  buildRegistrationModelPolicyDefaults,
  REGISTRATION_FIELD_ORDER,
  registrationSchema,
  type RegistrationFieldName,
  type RegistrationPolicyValidationResult,
  type RegistrationSubmitResult,
  type RegistrationValues,
} from './schemas/agent-registration';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import type { BrowserSafeModelPolicyWarning } from './schemas/model-policy';

export { validateRegistrationValues } from './schemas/agent-registration';
export type { RegistrationSubmitResult, RegistrationValues } from './schemas/agent-registration';

interface RegistrationFormProps {
  readonly initialAgent?: {
    readonly agentId: string;
    readonly agentRpcOrigin: string;
    readonly displayName: string;
    readonly displayOrder: number;
  };
  readonly initialCredential?: {
    readonly keyId: string;
    readonly maskedHint: string;
    readonly status: string;
  };
  readonly onSubmit: (values: RegistrationValues) => Promise<RegistrationSubmitResult>;
  readonly onValidateModelPolicy: (
    values: RegistrationValues
  ) => Promise<RegistrationPolicyValidationResult>;
}

/**
 * Accessible add/edit Agent registration form.
 *
 * Credential fields capture references and metadata only; no plaintext secret
 * is persisted or echoed back to the browser. The form uses shadcn `Form`,
 * `react-hook-form`, `zod`, and Server Actions per wireframe §6.2.
 */
export function AgentRegistrationForm({
  initialAgent,
  initialCredential,
  onSubmit,
  onValidateModelPolicy,
}: RegistrationFormProps) {
  const router = useRouter();
  const isEdit = initialAgent !== undefined;
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [policyValidationStatus, setPolicyValidationStatus] =
    useState<ModelPolicyValidationStatus>('idle');
  const [policyWarnings, setPolicyWarnings] = useState<readonly BrowserSafeModelPolicyWarning[]>(
    []
  );
  const form = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: createInitialValues(initialAgent, initialCredential),
    mode: 'onChange',
    shouldFocusError: true,
  });

  const handleValidSubmit = async (values: RegistrationValues) => {
    form.clearErrors();
    setFormError(undefined);
    setPending(true);
    try {
      const result = await onSubmit(values);
      if (result.ok) {
        router.push(`/agents/${result.agentId}`);
        return;
      }
      setFormError(result.formError ?? 'Could not register the Agent.');
      applyServerFieldErrors(form, result.fieldErrors);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not register the Agent.');
    } finally {
      setPending(false);
    }
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<RegistrationValues>) => {
    setFormError('Correct the highlighted fields before registering the Agent.');
    focusFirstInvalidField(form, fieldErrors);
  };

  const handleValidatePolicy = async (): Promise<void> => {
    // policy validation でも Agent ID、RPC origin、credential reference が必要なため、Server Action 前に同じ form validation を走らせる。
    const valid = await form.trigger(REGISTRATION_FIELD_ORDER);
    if (!valid) {
      setPolicyValidationStatus('invalid');
      setFormError('Correct the highlighted fields before validating the policy.');
      focusFirstInvalidField(form, form.formState.errors);
      return;
    }
    setPending(true);
    setPolicyValidationStatus('validating');
    setFormError(undefined);
    try {
      const result = await onValidateModelPolicy(form.getValues());
      if (result.ok) {
        setPolicyWarnings(result.warnings);
        setPolicyValidationStatus(result.warnings.length > 0 ? 'warning' : 'valid');
        return;
      }
      setPolicyWarnings(result.warnings ?? []);
      setPolicyValidationStatus('invalid');
      setFormError(result.formError ?? 'The default model policy could not be validated.');
      applyServerFieldErrors(form, result.fieldErrors);
    } catch (error) {
      setPolicyValidationStatus('unavailable');
      setFormError(
        error instanceof Error ? error.message : 'The default model policy could not be validated.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <ControlRoomFrame
      title={isEdit ? 'Agent registry › edit' : 'Agent registry › new'}
      signalLabel="registration"
    >
      <RegistrationFormContent
        form={form}
        isEdit={isEdit}
        pending={pending}
        formError={formError}
        policyValidationStatus={policyValidationStatus}
        policyWarnings={policyWarnings}
        onValidatePolicy={() => {
          void handleValidatePolicy();
        }}
        onSubmit={(event) => {
          void form.handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
        }}
        onCancel={() => {
          router.push('/agents');
        }}
      />
    </ControlRoomFrame>
  );
}

function createInitialValues(
  initialAgent?: RegistrationFormProps['initialAgent'],
  initialCredential?: RegistrationFormProps['initialCredential']
): RegistrationValues {
  return {
    agentId: initialAgent?.agentId ?? '',
    agentRpcOrigin: initialAgent?.agentRpcOrigin ?? '',
    displayName: initialAgent?.displayName ?? '',
    displayOrder: initialAgent !== undefined ? String(initialAgent.displayOrder) : '0',
    modelPolicy: buildRegistrationModelPolicyDefaults(),
    referenceValue: '',
    keyId: initialCredential?.keyId ?? '',
    publicFingerprint: '',
    maskedHint: initialCredential?.maskedHint ?? '',
    status: initialCredential?.status ?? 'active',
  };
}

function applyServerFieldErrors(
  form: UseFormReturn<RegistrationValues>,
  fieldErrors: Partial<Record<RegistrationFieldName, string>>
): void {
  let firstInvalidField: RegistrationFieldName | undefined;
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    const message = getServerFieldError(fieldErrors, fieldName);
    if (message !== undefined) {
      form.setError(fieldName, { type: 'server', message });
      firstInvalidField ??= fieldName;
    }
  }
  if (firstInvalidField !== undefined) {
    form.setFocus(firstInvalidField);
  }
}

function focusFirstInvalidField(
  form: UseFormReturn<RegistrationValues>,
  fieldErrors: FieldErrors<RegistrationValues>
): void {
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    if (getFormFieldError(fieldErrors, fieldName) !== undefined) {
      form.setFocus(fieldName);
      return;
    }
  }
}

interface RegistrationFormContentProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly isEdit: boolean;
  readonly pending: boolean;
  readonly formError: string | undefined;
  readonly policyValidationStatus: ModelPolicyValidationStatus;
  readonly policyWarnings: readonly BrowserSafeModelPolicyWarning[];
  readonly onValidatePolicy: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}

function RegistrationFormContent({
  form,
  isEdit,
  pending,
  formError,
  policyValidationStatus,
  policyWarnings,
  onValidatePolicy,
  onSubmit,
  onCancel,
}: RegistrationFormContentProps) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Registration
      </p>
      <h2>Capture references, not secrets.</h2>
      <p className="text-sm text-muted-foreground">
        Register a managed Agent by its ID and RPC origin. Credential references are stored as
        masked hints — never plaintext secrets.
      </p>

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate>
          <FormErrorSummary formError={formError} fieldErrors={form.formState.errors} />
          <RegistrationTextField
            form={form}
            name="agentId"
            label="Agent ID"
            helper="The Durable Object name. Lowercase, kebab-case."
            disabled={isEdit || pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="agentRpcOrigin"
            label="Agent RPC origin"
            helper="Connect + binary Protobuf endpoint, e.g. https://agent.example.com"
            disabled={pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayName"
            label="Display name"
            helper="Shown in the registry list and overview."
            disabled={pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayOrder"
            label="Sort order (optional)"
            helper="Lower numbers sort first within pin group."
            disabled={pending}
            inputMode="numeric"
          />
          <ModelPolicyFields
            form={form}
            names={buildModelPolicyFieldNames<RegistrationValues>('modelPolicy')}
            mode="create"
            disabled={pending}
            validationStatus={policyValidationStatus}
            warnings={policyWarnings}
            onValidate={onValidatePolicy}
          />
          <CredentialReferenceSection form={form} pending={pending} />
          <RegistrationActions isEdit={isEdit} pending={pending} onCancel={onCancel} />
        </form>
      </Form>
    </>
  );
}

interface RegistrationTextFieldProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly name: RegistrationFieldName;
  readonly label: string;
  readonly helper?: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly inputMode?: 'numeric';
}

function RegistrationTextField({
  form,
  name,
  label,
  helper,
  disabled,
  required,
  autoComplete,
  inputMode,
}: RegistrationTextFieldProps) {
  return (
    <RhfFormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {helper !== undefined ? <FormDescription>{helper}</FormDescription> : null}
          <FormControl>
            <Input
              {...field}
              autoComplete={autoComplete}
              disabled={disabled}
              inputMode={inputMode}
              required={required}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface CredentialReferenceSectionProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly pending: boolean;
}

function CredentialReferenceSection({ form, pending }: CredentialReferenceSectionProps) {
  return (
    <details open>
      <summary className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Credential reference
      </summary>
      <p className="text-xs text-muted-foreground">
        The Client stores a reference, key ID, masked hint, and status. The secret itself is
        resolved server-side only.
      </p>
      <RegistrationTextField
        form={form}
        name="referenceValue"
        label="Credential reference"
        helper="Opaque reference (e.g. secret path or KMS key ID)."
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="keyId"
        label="Key ID"
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="publicFingerprint"
        label="Public fingerprint"
        helper="Hex fingerprint of the Agent public key."
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="maskedHint"
        label="Masked hint"
        helper='e.g. "ed25519:ab…12" — never the full secret.'
        disabled={pending}
        autoComplete="off"
        required
      />
      <RhfFormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Status</FormLabel>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={pending}
              name={field.name}
            >
              <FormControl>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="rotating">rotating</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </details>
  );
}

interface FormErrorSummaryProps {
  readonly formError: string | undefined;
  readonly fieldErrors: FieldErrors<RegistrationValues>;
}

function FormErrorSummary({ formError, fieldErrors }: FormErrorSummaryProps) {
  const summaryItems = collectFieldErrorSummaryItems(fieldErrors);
  if (formError === undefined && summaryItems.length === 0) {
    return null;
  }
  return (
    <Alert variant="destructive" role="alert" aria-live="assertive" className="mb-6">
      <AlertTitle>Registration needs attention</AlertTitle>
      <AlertDescription>
        {formError ?? 'Correct the highlighted fields before registering the Agent.'}
      </AlertDescription>
      {summaryItems.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 font-mono text-xs">
          {summaryItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}

function collectFieldErrorSummaryItems(fieldErrors: FieldErrors<RegistrationValues>): string[] {
  const items: string[] = [];
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    const message = getFormFieldError(fieldErrors, fieldName)?.message;
    if (typeof message === 'string' && message !== '') {
      items.push(`${getRegistrationFieldLabel(fieldName)}: ${message}`);
    }
  }
  return items;
}

function getServerFieldError(
  fieldValues: Partial<Record<RegistrationFieldName, string>>,
  fieldName: RegistrationFieldName
): string | undefined {
  if (fieldName === 'agentId') return fieldValues.agentId;
  if (fieldName === 'agentRpcOrigin') return fieldValues.agentRpcOrigin;
  if (fieldName === 'displayName') return fieldValues.displayName;
  if (fieldName === 'displayOrder') return fieldValues.displayOrder;
  if (fieldName === 'modelPolicy.policyRef') return fieldValues['modelPolicy.policyRef'];
  if (fieldName === 'modelPolicy.provider') return fieldValues['modelPolicy.provider'];
  if (fieldName === 'modelPolicy.model') return fieldValues['modelPolicy.model'];
  if (fieldName === 'modelPolicy.temperature') return fieldValues['modelPolicy.temperature'];
  if (fieldName === 'modelPolicy.topP') return fieldValues['modelPolicy.topP'];
  if (fieldName === 'modelPolicy.maxOutputTokens') {
    return fieldValues['modelPolicy.maxOutputTokens'];
  }
  if (fieldName === 'referenceValue') return fieldValues.referenceValue;
  if (fieldName === 'keyId') return fieldValues.keyId;
  if (fieldName === 'publicFingerprint') return fieldValues.publicFingerprint;
  if (fieldName === 'maskedHint') return fieldValues.maskedHint;
  return fieldValues.status;
}

function getRegistrationFieldLabel(fieldName: RegistrationFieldName): string {
  if (fieldName === 'agentId') return 'Agent ID';
  if (fieldName === 'agentRpcOrigin') return 'Agent RPC origin';
  if (fieldName === 'displayName') return 'Display name';
  if (fieldName === 'displayOrder') return 'Sort order';
  if (fieldName === 'modelPolicy.policyRef') return 'Policy ref';
  if (fieldName === 'modelPolicy.provider') return 'Provider';
  if (fieldName === 'modelPolicy.model') return 'Model ID';
  if (fieldName === 'modelPolicy.temperature') return 'Temperature';
  if (fieldName === 'modelPolicy.topP') return 'Top P';
  if (fieldName === 'modelPolicy.maxOutputTokens') return 'Max output tokens';
  if (fieldName === 'referenceValue') return 'Credential reference';
  if (fieldName === 'keyId') return 'Key ID';
  if (fieldName === 'publicFingerprint') return 'Public fingerprint';
  if (fieldName === 'maskedHint') return 'Masked hint';
  return 'Status';
}

function getFormFieldError(
  fieldErrors: FieldErrors<RegistrationValues>,
  fieldName: RegistrationFieldName
) {
  if (fieldName === 'agentId') return fieldErrors.agentId;
  if (fieldName === 'agentRpcOrigin') return fieldErrors.agentRpcOrigin;
  if (fieldName === 'displayName') return fieldErrors.displayName;
  if (fieldName === 'displayOrder') return fieldErrors.displayOrder;
  if (fieldName === 'modelPolicy.policyRef') return fieldErrors.modelPolicy?.policyRef;
  if (fieldName === 'modelPolicy.provider') return fieldErrors.modelPolicy?.provider;
  if (fieldName === 'modelPolicy.model') return fieldErrors.modelPolicy?.model;
  if (fieldName === 'modelPolicy.temperature') return fieldErrors.modelPolicy?.temperature;
  if (fieldName === 'modelPolicy.topP') return fieldErrors.modelPolicy?.topP;
  if (fieldName === 'modelPolicy.maxOutputTokens') return fieldErrors.modelPolicy?.maxOutputTokens;
  if (fieldName === 'referenceValue') return fieldErrors.referenceValue;
  if (fieldName === 'keyId') return fieldErrors.keyId;
  if (fieldName === 'publicFingerprint') return fieldErrors.publicFingerprint;
  if (fieldName === 'maskedHint') return fieldErrors.maskedHint;
  return fieldErrors.status;
}
