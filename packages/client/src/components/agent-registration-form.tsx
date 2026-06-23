'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormReturn } from 'react-hook-form';

import { ControlRoomFrame } from './control-room-frame';
import {
  REGISTRATION_FIELD_ORDER,
  registrationSchema,
  type RegistrationFieldName,
  type RegistrationSubmitResult,
  type RegistrationValues,
} from './schemas/agent-registration';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
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
}: RegistrationFormProps) {
  const router = useRouter();
  const isEdit = initialAgent !== undefined;
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
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

  return (
    <ControlRoomFrame
      title={isEdit ? 'Agent registry › edit' : 'Agent registry › new'}
      signalLabel="registration"
      currentSection="new"
    >
      <RegistrationFormContent
        form={form}
        isEdit={isEdit}
        pending={pending}
        formError={formError}
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
    const message = getFieldValue(fieldErrors, fieldName);
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
    if (getFieldValue(fieldErrors, fieldName) !== undefined) {
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
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}

function RegistrationFormContent({
  form,
  isEdit,
  pending,
  formError,
  onSubmit,
  onCancel,
}: RegistrationFormContentProps) {
  return (
    <>
      <p className="eyebrow">Registration</p>
      <h2>Capture references, not secrets.</h2>
      <p className="lead">
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
      <summary className="eyebrow">Credential reference</summary>
      <p className="form-helper">
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
            <FormControl>
              <Select {...field} disabled={pending}>
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="rotating">rotating</option>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </details>
  );
}

interface RegistrationActionsProps {
  readonly isEdit: boolean;
  readonly pending: boolean;
  readonly onCancel: () => void;
}

function RegistrationActions({ isEdit, pending, onCancel }: RegistrationActionsProps) {
  return (
    <div className="action-row">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" variant="default" disabled={pending} aria-disabled={pending}>
        {pending ? 'Registering…' : isEdit ? 'Save changes' : 'Register Agent'}
      </Button>
    </div>
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
    const message = getFieldValue(fieldErrors, fieldName)?.message;
    if (typeof message === 'string' && message !== '') {
      items.push(`${getFieldLabel(fieldName)}: ${message}`);
    }
  }
  return items;
}

function getFieldValue<TValue>(
  fieldValues: Partial<Record<RegistrationFieldName, TValue>>,
  fieldName: RegistrationFieldName
): TValue | undefined {
  if (fieldName === 'agentId') return fieldValues.agentId;
  if (fieldName === 'agentRpcOrigin') return fieldValues.agentRpcOrigin;
  if (fieldName === 'displayName') return fieldValues.displayName;
  if (fieldName === 'displayOrder') return fieldValues.displayOrder;
  if (fieldName === 'referenceValue') return fieldValues.referenceValue;
  if (fieldName === 'keyId') return fieldValues.keyId;
  if (fieldName === 'publicFingerprint') return fieldValues.publicFingerprint;
  if (fieldName === 'maskedHint') return fieldValues.maskedHint;
  return fieldValues.status;
}

function getFieldLabel(fieldName: RegistrationFieldName): string {
  if (fieldName === 'agentId') return 'Agent ID';
  if (fieldName === 'agentRpcOrigin') return 'Agent RPC origin';
  if (fieldName === 'displayName') return 'Display name';
  if (fieldName === 'displayOrder') return 'Sort order';
  if (fieldName === 'referenceValue') return 'Credential reference';
  if (fieldName === 'keyId') return 'Key ID';
  if (fieldName === 'publicFingerprint') return 'Public fingerprint';
  if (fieldName === 'maskedHint') return 'Masked hint';
  return 'Status';
}
