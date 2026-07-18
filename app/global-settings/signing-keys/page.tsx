import { listManagedAgents } from '@cf-tamac/client/server/actions/managed-agents';
import {
  generateSigningKey,
  listSigningKeys,
  setDefaultSigningKey,
  updateSigningKeyStatus,
} from '@cf-tamac/client/server/actions/signing-keys';

import { ControlRoomFrame } from '../../../src/components/control-room-frame';
import { SigningKeyManagement } from '../../../src/components/signing-key-management';

export const dynamic = 'force-dynamic';

/**
 * Global Settings > Signing Keys 画面 (AGENT-MANAGEMENT-UI-S010 / S020)。
 *
 * Agent が 0 件でも Client-wide signing key lifecycle を利用できる。Server Action から
 * browser-safe signing key 一覧と managed Agent 件数だけを受け取り、private material は
 * 一切表示しない。feature component は server-only module を直接 import せず、
 * page (Server Component) が void 返しの form action を組み立てて props で渡す。
 *
 * Delete 操作は hard delete ではなく tombstone (`updateSigningKeyStatus('deleted')`) に接続し、
 * 公開 tombstone metadata を残して trust config 上の revoked entry として出力できるようにする。
 */
async function generateSigningKeyFormAction(): Promise<void> {
  'use server';
  await generateSigningKey();
}

async function setDefaultSigningKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  const { issuer, keyId } = readSigningKeyFormData(formData);
  await setDefaultSigningKey(issuer, keyId);
}

async function disableSigningKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  const { issuer, keyId } = readSigningKeyFormData(formData);
  await updateSigningKeyStatus(issuer, keyId, 'disabled');
}

async function enableSigningKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  const { issuer, keyId } = readSigningKeyFormData(formData);
  await updateSigningKeyStatus(issuer, keyId, 'active');
}

async function deleteSigningKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  const { issuer, keyId } = readSigningKeyFormData(formData);
  // hard delete ではなく tombstone: 復号不能 ciphertext へ置換し、公開 metadata を残して
  // trust config の revoked entry として出力できるようにする。
  await updateSigningKeyStatus(issuer, keyId, 'deleted');
}

function readSigningKeyFormData(formData: FormData): {
  readonly issuer: string;
  readonly keyId: string;
} {
  const issuer = formData.get('issuer');
  const keyId = formData.get('keyId');
  if (typeof issuer !== 'string' || issuer === '' || typeof keyId !== 'string' || keyId === '') {
    throw new Error('Signing key form fields are missing.');
  }
  return { issuer, keyId };
}

export default async function SigningKeysPage() {
  const [signingKeys, managedAgents] = await Promise.all([listSigningKeys(), listManagedAgents()]);
  return (
    <ControlRoomFrame
      title="Global Settings › Signing Keys"
      signalLabel="Client signing keys"
      description="Client-wide Ed25519 signing keys for Agent RPC JWT signing."
    >
      <SigningKeyManagement
        signingKeys={signingKeys}
        managedAgentCount={managedAgents.length}
        actions={{
          generate: generateSigningKeyFormAction,
          setDefault: setDefaultSigningKeyFormAction,
          disable: disableSigningKeyFormAction,
          enable: enableSigningKeyFormAction,
          delete: deleteSigningKeyFormAction,
        }}
      />
    </ControlRoomFrame>
  );
}
