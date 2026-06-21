'use server';

import { revalidatePath } from 'next/cache';

import {
  createCredentialReferenceRepository,
  createManagedAgentRepository,
  type CredentialReferenceRecord,
  type ManagedAgentRecord,
} from '../db';
import { getClientWorkerEnv } from '../env';

/**
 * Input for registering a managed Agent in the Client ledger.
 */
export interface RegisterManagedAgentInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

/**
 * Input for saving a credential reference without secret material.
 */
export interface SaveCredentialReferenceInput {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Register or update Client-owned managed Agent metadata.
 */
export async function registerManagedAgent(
  input: RegisterManagedAgentInput
): Promise<ManagedAgentRecord> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).upsertManagedAgent(input);
  revalidatePath('/agents');
  revalidatePath(`/agents/${record.agentId}`);
  return record;
}

/**
 * Mark a managed Agent as opened by the management shell.
 */
export async function markManagedAgentOpened(
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const env = getClientWorkerEnv();
  const record = await createManagedAgentRepository(env.CLIENT_DB).markManagedAgentOpened(agentId);
  revalidatePath('/agents');
  return record;
}

/**
 * Save a Client-owned credential reference without storing credential material.
 */
export async function saveCredentialReference(
  input: SaveCredentialReferenceInput
): Promise<CredentialReferenceRecord> {
  const env = getClientWorkerEnv();
  const record = await createCredentialReferenceRepository(env.CLIENT_DB).upsertCredentialReference(
    input
  );
  revalidatePath(`/agents/${record.agentId}/settings`);
  return record;
}
