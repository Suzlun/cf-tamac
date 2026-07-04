'use server';

import 'server-only';

import { mapClientStatusToTrustStatus, type Ed25519PublicJwk } from '../credentials/signing-keys';
import { createSigningKeyRepository } from '../db';
import { getClientWorkerEnv } from '../env';

import type {
  TrustConfigExport,
  TrustConfigIssuerEntry,
  TrustConfigKeyEntry,
  TrustConfigExportInput,
  TrustConfigExportResult,
} from '../../lib/signing-key-types';

/**
 * Trust config export で許容する Client Service / Agent 側 scope。
 *
 * @remarks Agent 側の `AgentControlPlaneScope` と一致させる。UI はこの一覧だけを提示し、server action はこれ以外の scope を拒否する。
 */
const ALLOWED_TRUST_SCOPES = new Set([
  'agent:read',
  'agent:write',
  'agent:tool:approve',
  'agent:integration:admin',
  'agent:admin',
  '*',
]);
const ALLOWED_TRUST_STATUSES = new Set(['active', 'retiring', 'revoked']);

export type {
  TrustConfigExport,
  TrustConfigExportInput,
  TrustConfigExportResult,
  TrustConfigKeyEntry,
  TrustKeyStatus,
} from '../../lib/signing-key-types';

/**
 * Client signing key store から public-only trust config JSON を生成する。
 *
 * @remarks
 * Agent parser は principalType / allowedAgentIds / allowedScopes を各 key entry 内に要求するため、
 * policy を issuer level ではなく key ごとに出力する (Agent 側 trust config parser の schema が正本)。
 * 出力 JSON は公開情報 (kty/crv/x/status/principalType/allowedAgentIds/allowedScopes/fingerprint) だけで構成し、
 * private parameter `d` / private JWK plaintext / 暗号化 envelope / 生 JWT を一切含まない。
 * Client status `active` key は trust config で `active`/`retiring` を選択可能。
 * Client status `disabled`/`deleted` key は `revoked` としてだけ出力可能 (UI も server action もこれを強制する)。
 */
export async function buildTrustConfigExport(
  input: TrustConfigExportInput
): Promise<TrustConfigExportResult> {
  const validation = validateTrustConfigInput(input);
  if (validation !== undefined) {
    return { ok: false, validationError: validation };
  }

  const env = getClientWorkerEnv();
  const repository = createSigningKeyRepository(env.CLIENT_DB);

  const selectedKeys: TrustConfigKeyEntry[] = [];
  for (const selection of input.selections) {
    const record = await repository.getSigningKey(selection.issuer, selection.kid);
    if (record === undefined) {
      return {
        ok: false,
        validationError: 'A selected signing key was not found in the Client signing key store.',
      };
    }
    let publicJwk: Ed25519PublicJwk;
    try {
      publicJwk = JSON.parse(record.publicJwk) as Ed25519PublicJwk;
    } catch {
      return { ok: false, validationError: 'A selected signing key public JWK is malformed.' };
    }
    const clientStatus = record.status;
    const allowedTrustStatus = mapClientStatusToTrustStatus(clientStatus);
    // disabled/deleted key は revoked 以外へ出力できない。active key だけが active/retiring を選べる。
    if (selection.trustStatus !== 'revoked' && allowedTrustStatus === 'revoked') {
      return {
        ok: false,
        validationError:
          'A disabled or deleted signing key can only be exported as revoked in the trust config.',
      };
    }
    if (selection.trustStatus === 'revoked' && allowedTrustStatus === 'active') {
      // active key を revoked 出力するのは rotation 中の旧鍵明示的手段として許容する。
    }
    selectedKeys.push({
      issuer: record.issuer,
      kid: record.keyId,
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      status: selection.trustStatus,
      principalType: 'CLIENT_SERVICE',
      allowedAgentIds: input.allowedAgentIds,
      allowedScopes: input.allowedScopes,
      fingerprint: record.publicFingerprint,
    });
  }

  const issuerEntry: TrustConfigIssuerEntry = {
    issuer: input.issuer,
    keys: selectedKeys,
  };

  const exportValue: TrustConfigExport = {
    version: '1',
    audiences: ['agent service'],
    issuers: [issuerEntry],
  };

  return {
    ok: true,
    export: exportValue,
    broadPermissionWarning: resolveBroadPermissionWarning(input),
  };
}

/**
 * trust config 入力の形状 validation を行う。
 *
 * @returns 不正がある場合は安全な message、問題なければ `undefined`。
 */
function validateTrustConfigInput(input: TrustConfigExportInput): string | undefined {
  if (input.issuer === '') {
    return 'Issuer is required.';
  }
  const tamperableInput = input as { readonly principalType?: unknown };
  if (tamperableInput.principalType !== 'CLIENT_SERVICE') {
    return 'Trust config export only supports the Client Service principal type.';
  }
  if (input.allowedAgentIds.length === 0) {
    return 'At least one allowed agent id is required.';
  }
  for (const agentId of input.allowedAgentIds) {
    if (agentId === '') {
      return 'Allowed agent ids must not be empty.';
    }
  }
  if (input.allowedScopes.length === 0) {
    return 'At least one allowed scope is required.';
  }
  for (const scope of input.allowedScopes) {
    if (!ALLOWED_TRUST_SCOPES.has(scope)) {
      return `Allowed scope ${scope} is not a recognized Agent scope.`;
    }
  }
  if (input.selections.length === 0) {
    return 'At least one signing key must be selected.';
  }
  for (const selection of input.selections) {
    if (selection.issuer === '' || selection.kid === '') {
      return 'Each signing key selection needs an issuer and key id.';
    }
    if (selection.issuer !== input.issuer) {
      return 'Each signing key selection must match the exported issuer.';
    }
    if (!ALLOWED_TRUST_STATUSES.has(selection.trustStatus)) {
      return 'Each signing key selection needs a recognized trust status.';
    }
  }
  return undefined;
}

/**
 * 広すぎる scope / wildcard Agent 選択に対する browser-safe 警告文を返す。
 *
 * @remarks 警告文だけを返し、操作を強制阻止はしない。運用者は警告を確認した上で export する。
 */
function resolveBroadPermissionWarning(
  input: Pick<TrustConfigExportInput, 'allowedAgentIds' | 'allowedScopes'>
): string | undefined {
  const wildcardAgent = input.allowedAgentIds.includes('*');
  const hasHighPrivilege =
    input.allowedScopes.includes('agent:admin') ||
    input.allowedScopes.includes('agent:write') ||
    input.allowedScopes.includes('*');
  if (wildcardAgent && hasHighPrivilege) {
    return 'Wildcard agent selection combined with high-privilege scopes grants broad access across every Agent. Restrict allowedAgentIds and scopes.';
  }
  if (wildcardAgent) {
    return 'Wildcard agent selection grants access across every Agent. Prefer explicit agent IDs.';
  }
  if (hasHighPrivilege) {
    return 'High-privilege scopes grant write, admin, or wildcard authority. Restrict them to operators that need them.';
  }
  return undefined;
}
