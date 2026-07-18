/**
 * Client Service signing key と trust config / health verification の browser-safe 表示型。
 *
 * @remarks
 * この module は server-only module ではなく、src/components/** と src/app/** の
 * browser-visible module から安全に import できる純粋な型定義のみを公開する。
 * private JWK / 暗号化 envelope / 生 JWT / signing logic を一切表現せず、
 * 公開情報だけを運ぶ shape を定義する。runtime の値生成は server-only の
 * `packages/client/src/server/credentials/browser-safe.ts` と各 Server Action が担当する。
 */

/**
 * Browser-safe Client Service signing key view。
 *
 * @remarks
 * private JWK ciphertext / 暗号化 envelope / 秘密鍵 plaintext / 生 JWT を一切含まず、
 * Global Settings の署名鍵管理 UI と trust config export が表示に必要な公開情報だけを持つ。
 * `publicJwk` は Ed25519 公開鍵 (kty/crv/x) の JSON 文字列であり、Agent trust config export の素材になる。
 */
export interface BrowserSafeSigningKey {
  readonly issuer: string;
  readonly keyId: string;
  readonly publicJwk: string;
  readonly publicFingerprint: string;
  readonly status: string;
  readonly isDefault: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly lastUsedAtMs?: number;
}

/**
 * Trust config export で許容する key lifecycle status (Agent 側)。
 */
export type TrustKeyStatus = 'active' | 'retiring' | 'revoked';

/**
 * 1 鍵ごとの trust config 公開 entry。
 *
 * @remarks Agent 側 trust config parser は principalType / allowedAgentIds / allowedScopes を key ごとに要求するため、これらを entry 内へ置く。
 */
export interface TrustConfigKeyEntry {
  readonly issuer: string;
  readonly kid: string;
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly x: string;
  readonly status: TrustKeyStatus;
  readonly principalType: 'CLIENT_SERVICE';
  readonly allowedAgentIds: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly fingerprint: string;
}

/**
 * 1 issuer 単位の trust config entry。
 *
 * @remarks issuer 名と、その issuer に属する key entry 一覧だけを持つ。policy は各 key に属する。
 */
export interface TrustConfigIssuerEntry {
  readonly issuer: string;
  readonly keys: readonly TrustConfigKeyEntry[];
}

/**
 * `AGENT_CONTROL_PLANE_TRUST` へ貼る public-only trust config JSON。
 */
export interface TrustConfigExport {
  readonly version: string;
  readonly audiences: readonly string[];
  readonly issuers: readonly TrustConfigIssuerEntry[];
}

/**
 * trust config export action の browser-safe 結果。
 */
export interface TrustConfigExportResult {
  readonly ok: boolean;
  readonly export?: TrustConfigExport;
  readonly validationError?: string;
  readonly broadPermissionWarning?: string;
}

/**
 * 1 鍵ごとの trust status 選択。
 */
export interface TrustConfigKeySelection {
  readonly issuer: string;
  readonly kid: string;
  readonly trustStatus: TrustKeyStatus;
}

/**
 * trust config export action へ渡す入力。
 *
 * @remarks principalType / allowedAgentIds / allowedScopes は各 key entry へ適用される policy。
 */
export interface TrustConfigExportInput {
  readonly issuer: string;
  readonly principalType: 'CLIENT_SERVICE';
  readonly allowedAgentIds: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly selections: readonly TrustConfigKeySelection[];
}

/**
 * Agent Health Check から得た公開 trust 診断情報 (browser-safe)。
 */
export interface BrowserSafeTrustDiagnostic {
  readonly trustConfigVersion?: string;
  readonly trustConfigFingerprint?: string;
  readonly trustConfigLoadedAtMs?: number;
  readonly trustConfigStatus?: string;
  readonly principalIssuer?: string;
  readonly principalKid?: string;
  readonly principalFingerprint?: string;
  readonly principalKeyStatus?: string;
  readonly principalVerified?: boolean;
  readonly verifiedAtUnixMs?: number;
}

/**
 * Agent Health Check action の browser-safe 結果。
 */
export interface BrowserSafeHealthVerificationResult {
  readonly ok: boolean;
  readonly agentId: string;
  readonly servingStatus?: string;
  readonly serviceVersion?: string;
  readonly lastVerifiedAtMs?: number;
  readonly diagnostic?: BrowserSafeTrustDiagnostic;
  readonly safeMessage?: string;
}
