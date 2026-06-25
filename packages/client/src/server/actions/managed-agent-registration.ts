import { validateRegistrationModelPolicyValues } from '../../components/schemas/agent-registration';

import type { ModelPolicyDraftValues } from '../../components/schemas/model-policy';
import type {
  CredentialReferenceRepository,
  ManagedAgentRecord,
  ManagedAgentRepository,
} from '../db';

const AGENT_ID_PATTERN = /^[\da-z][\da-z-]{0,62}$/;
const VALID_CREDENTIAL_STATUSES = ['active', 'pending', 'rotating'] as const;

type RegistrationFieldName =
  | 'agentId'
  | 'agentRpcOrigin'
  | 'displayName'
  | 'displayOrder'
  | 'modelPolicy.policyRef'
  | 'modelPolicy.provider'
  | 'modelPolicy.model'
  | 'modelPolicy.temperature'
  | 'modelPolicy.topP'
  | 'modelPolicy.maxOutputTokens'
  | 'referenceValue'
  | 'keyId'
  | 'publicFingerprint'
  | 'maskedHint'
  | 'status';

type RegistrationFieldErrors = Partial<Record<RegistrationFieldName, string>>;

/**
 * Normalized, server-validated Agent registration input.
 */
export interface NormalizedManagedAgentRegistrationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: number;
  readonly modelPolicy: ModelPolicyDraftValues;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Browser-submitted Agent registration input using browser-safe field names.
 */
export interface ManagedAgentRegistrationInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: string;
  readonly modelPolicy: ModelPolicyDraftValues;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Options for registration persistence, including edit-mode identity.
 */
export interface ManagedAgentRegistrationOptions {
  readonly existingAgentId?: string;
}

/**
 * Server Action result for Agent registration submissions.
 */
export type ManagedAgentRegistrationResult =
  | { readonly ok: true; readonly agentId: string }
  | {
      readonly ok: false;
      readonly fieldErrors: RegistrationFieldErrors;
      readonly formError?: string;
    };

/**
 * Repositories needed to persist a validated managed Agent registration.
 */
export interface RegistrationRepositories {
  readonly agents: ManagedAgentRepository;
  readonly credentials: CredentialReferenceRepository;
}

/**
 * Result of server-side registration validation before any Client D1 write.
 */
export type ManagedAgentRegistrationValidationResult =
  | { readonly ok: true; readonly value: NormalizedManagedAgentRegistrationInput }
  | { readonly ok: false; readonly fieldErrors: RegistrationFieldErrors };

/**
 * Validate managed Agent registration fields without touching Client D1.
 */
export function validateManagedAgentRegistrationInput(
  input: ManagedAgentRegistrationInput
): ManagedAgentRegistrationValidationResult {
  const normalized = normalizeRegistrationInput(input);
  const fieldErrors = collectRegistrationFieldErrors(normalized, input.displayOrder);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, value: normalized };
}

/**
 * Persist a validated registration through injected repositories.
 */
export async function persistManagedAgentRegistration(
  input: NormalizedManagedAgentRegistrationInput,
  repositories: RegistrationRepositories,
  options: ManagedAgentRegistrationOptions = {}
): Promise<ManagedAgentRegistrationResult> {
  const mode = await determineRegistrationMode(input, repositories.agents, options);
  if (!mode.ok) {
    return registrationFieldErrorResult(mode.fieldErrors);
  }

  try {
    await writeRegistrationRecords(input, repositories, mode.action);
    return { ok: true, agentId: input.agentId };
  } catch (error) {
    await rollbackRegistrationWrite(input, repositories.agents, mode.action, mode.previousAgent);
    if (isLikelyDuplicateAgentError(error)) {
      return registrationFieldErrorResult({ agentId: 'Agent ID is already registered.' });
    }
    return {
      ok: false,
      fieldErrors: {},
      formError: 'Could not register the Agent. Retrying will not duplicate the record.',
    };
  }
}

function normalizeRegistrationInput(
  input: ManagedAgentRegistrationInput
): NormalizedManagedAgentRegistrationInput {
  return {
    agentId: input.agentId.trim(),
    agentRpcOrigin: input.agentRpcOrigin.trim(),
    displayName: input.displayName.trim(),
    displayOrder: parseDisplayOrder(input.displayOrder),
    modelPolicy: normalizeModelPolicyDraft(input.modelPolicy),
    referenceValue: input.referenceValue.trim(),
    keyId: input.keyId.trim(),
    publicFingerprint: input.publicFingerprint.trim(),
    maskedHint: input.maskedHint.trim(),
    status: input.status.trim(),
  };
}

function normalizeModelPolicyDraft(modelPolicy: ModelPolicyDraftValues): ModelPolicyDraftValues {
  return {
    policyRef: modelPolicy.policyRef.trim(),
    provider: modelPolicy.provider,
    model: modelPolicy.model.trim(),
    temperature: modelPolicy.temperature.trim(),
    topP: modelPolicy.topP.trim(),
    maxOutputTokens: modelPolicy.maxOutputTokens.trim(),
  };
}

function collectRegistrationFieldErrors(
  input: NormalizedManagedAgentRegistrationInput,
  rawDisplayOrder: string
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  addAgentIdentityErrors(errors, input);
  addModelPolicyErrors(errors, input.modelPolicy);
  addCredentialLookupErrors(errors, input);
  if (rawDisplayOrder.trim() !== '' && !/^\d+$/.test(rawDisplayOrder.trim())) {
    errors.displayOrder = 'Sort order must be a non-negative integer.';
  }
  if (!isValidCredentialStatus(input.status)) {
    errors.status = 'Status must be active, pending, or rotating.';
  }
  return errors;
}

function addModelPolicyErrors(
  errors: RegistrationFieldErrors,
  modelPolicy: ModelPolicyDraftValues
): void {
  const mappedErrors = validateRegistrationModelPolicyValues(modelPolicy);
  setRegistrationError(errors, 'modelPolicy.policyRef', mappedErrors['modelPolicy.policyRef']);
  setRegistrationError(errors, 'modelPolicy.provider', mappedErrors['modelPolicy.provider']);
  setRegistrationError(errors, 'modelPolicy.model', mappedErrors['modelPolicy.model']);
  setRegistrationError(errors, 'modelPolicy.temperature', mappedErrors['modelPolicy.temperature']);
  setRegistrationError(errors, 'modelPolicy.topP', mappedErrors['modelPolicy.topP']);
  setRegistrationError(
    errors,
    'modelPolicy.maxOutputTokens',
    mappedErrors['modelPolicy.maxOutputTokens']
  );
}

function addAgentIdentityErrors(
  errors: RegistrationFieldErrors,
  input: NormalizedManagedAgentRegistrationInput
): void {
  if (input.agentId === '') {
    errors.agentId = 'Agent ID is required.';
  } else if (!AGENT_ID_PATTERN.test(input.agentId)) {
    errors.agentId = 'Agent ID must be lowercase kebab-case (max 63 chars).';
  }
  if (!isValidHttpsUrl(input.agentRpcOrigin) || input.agentRpcOrigin.length > 2048) {
    errors.agentRpcOrigin = 'RPC origin must be a valid https:// URL.';
  }
  if (input.displayName === '' || input.displayName.length > 80) {
    errors.displayName = 'Display name is required (max 80 characters).';
  }
}

function addCredentialLookupErrors(
  errors: RegistrationFieldErrors,
  input: NormalizedManagedAgentRegistrationInput
): void {
  if (input.referenceValue === '' || input.referenceValue.length > 512) {
    errors.referenceValue = 'Credential reference is required.';
  }
  if (input.keyId === '' || input.keyId.length > 128) {
    errors.keyId = 'Key ID is required.';
  }
  if (input.publicFingerprint === '' || input.publicFingerprint.length > 128) {
    errors.publicFingerprint = 'Public fingerprint is required.';
  }
  if (input.maskedHint === '' || input.maskedHint.length > 64) {
    errors.maskedHint = 'Masked hint is required.';
  }
}

function parseDisplayOrder(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return 0;
  }
  return Number.parseInt(trimmed, 10);
}

function isValidCredentialStatus(status: string): boolean {
  return VALID_CREDENTIAL_STATUSES.includes(status as (typeof VALID_CREDENTIAL_STATUSES)[number]);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasFieldErrors(errors: RegistrationFieldErrors): boolean {
  return (
    errors.agentId !== undefined ||
    errors.agentRpcOrigin !== undefined ||
    errors.displayName !== undefined ||
    errors.displayOrder !== undefined ||
    errors['modelPolicy.policyRef'] !== undefined ||
    errors['modelPolicy.provider'] !== undefined ||
    errors['modelPolicy.model'] !== undefined ||
    errors['modelPolicy.temperature'] !== undefined ||
    errors['modelPolicy.topP'] !== undefined ||
    errors['modelPolicy.maxOutputTokens'] !== undefined ||
    errors.referenceValue !== undefined ||
    errors.keyId !== undefined ||
    errors.publicFingerprint !== undefined ||
    errors.maskedHint !== undefined ||
    errors.status !== undefined
  );
}

function setRegistrationError(
  errors: RegistrationFieldErrors,
  fieldName: RegistrationFieldName,
  message: string | undefined
): void {
  if (message === undefined) {
    return;
  }
  if (fieldName === 'modelPolicy.policyRef') errors['modelPolicy.policyRef'] = message;
  if (fieldName === 'modelPolicy.provider') errors['modelPolicy.provider'] = message;
  if (fieldName === 'modelPolicy.model') errors['modelPolicy.model'] = message;
  if (fieldName === 'modelPolicy.temperature') errors['modelPolicy.temperature'] = message;
  if (fieldName === 'modelPolicy.topP') errors['modelPolicy.topP'] = message;
  if (fieldName === 'modelPolicy.maxOutputTokens') errors['modelPolicy.maxOutputTokens'] = message;
}

function registrationFieldErrorResult(
  fieldErrors: RegistrationFieldErrors
): ManagedAgentRegistrationResult {
  return {
    ok: false,
    fieldErrors,
    formError: 'Correct the highlighted fields before registering the Agent.',
  };
}

async function determineRegistrationMode(
  input: NormalizedManagedAgentRegistrationInput,
  agents: ManagedAgentRepository,
  options: ManagedAgentRegistrationOptions
): Promise<
  | {
      readonly ok: true;
      readonly action: 'create' | 'update';
      readonly previousAgent?: ManagedAgentRecord;
    }
  | { readonly ok: false; readonly fieldErrors: RegistrationFieldErrors }
> {
  if (options.existingAgentId !== undefined && options.existingAgentId !== input.agentId) {
    return { ok: false, fieldErrors: { agentId: 'Agent ID cannot be changed while editing.' } };
  }
  const existing = await agents.getManagedAgent(input.agentId);
  if (options.existingAgentId === undefined && existing !== undefined) {
    return { ok: false, fieldErrors: { agentId: 'Agent ID is already registered.' } };
  }
  return {
    ok: true,
    action: options.existingAgentId === undefined ? 'create' : 'update',
    previousAgent: existing,
  };
}

async function writeRegistrationRecords(
  input: NormalizedManagedAgentRegistrationInput,
  repositories: RegistrationRepositories,
  action: 'create' | 'update'
): Promise<void> {
  const agentInput = {
    agentId: input.agentId,
    agentRpcOrigin: input.agentRpcOrigin,
    displayName: input.displayName,
    displayOrder: input.displayOrder,
  };
  if (action === 'create') {
    await repositories.agents.createManagedAgent(agentInput);
  } else {
    await repositories.agents.upsertManagedAgent(agentInput);
  }
  await repositories.credentials.upsertCredentialReference({
    agentId: input.agentId,
    credentialRef: input.referenceValue,
    keyId: input.keyId,
    publicFingerprint: input.publicFingerprint,
    maskedHint: input.maskedHint,
    status: input.status,
  });
}

async function rollbackRegistrationWrite(
  input: NormalizedManagedAgentRegistrationInput,
  agents: ManagedAgentRepository,
  action: 'create' | 'update',
  previousAgent: ManagedAgentRecord | undefined
): Promise<void> {
  try {
    if (action === 'create') {
      await agents.deleteManagedAgent(input.agentId);
    } else if (previousAgent !== undefined) {
      await agents.upsertManagedAgent(previousAgent);
    }
  } catch {
    // The original persistence error remains the user-facing failure cause.
  }
}

function isLikelyDuplicateAgentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /unique|constraint|primary key/i.test(error.message);
}
