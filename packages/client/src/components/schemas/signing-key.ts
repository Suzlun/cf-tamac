import { z } from 'zod';

/**
 * Trust config export の form で選択可能な Client key status (UI 表示用)。
 *
 * @remarks Agent 側 trust config の lifecycle status と対応する。
 */
export const trustKeyStatusSchema = z.enum(['active', 'retiring', 'revoked']);

/**
 * Client signing key の UI 表示 lifecycle status。
 */
export const clientSigningKeyStatusSchema = z.enum(['active', 'disabled', 'deleted']);

/**
 * principalType として許容する値。Trust Config Export は CLIENT_SERVICE 固定。
 *
 * @remarks ADMIN_OPERATOR は break-glass recovery のみで、Client signing key store 由来の
 * trust config export には使わせない (Agent parser が missing_policy で拒否する)。
 */
export const trustPrincipalTypeSchema = z.literal('CLIENT_SERVICE');

/**
 * Trust config export form の入力 schema。
 *
 * @remarks
 * private material は一切受け取らず、issuer / principalType / allowedAgentIds / allowedScopes /
 * 鍵ごとの trust status 選択だけを検査する。Server Action が最終的な公開情報のみで JSON を組み立てる。
 */
export const trustConfigExportFormSchema = z.object({
  issuer: z.string().min(1, 'Issuer is required.'),
  principalType: trustPrincipalTypeSchema,
  allowedAgentIds: z
    .array(z.string().min(1))
    .min(1, 'At least one allowed agent id or wildcard is required.'),
  allowedScopes: z.array(z.string().min(1)).min(1, 'At least one allowed scope is required.'),
  selections: z
    .array(
      z.object({
        issuer: z.string().min(1),
        kid: z.string().min(1),
        trustStatus: trustKeyStatusSchema,
      })
    )
    .min(1, 'At least one signing key must be selected.'),
});

/**
 * Trust config export form の入力型。
 */
export type TrustConfigExportFormValues = z.infer<typeof trustConfigExportFormSchema>;

/**
 * Signing key management form の操作種別。
 */
export type SigningKeyManagementAction =
  | 'generate'
  | 'set-default'
  | 'disable'
  | 'delete'
  | 'enable';

/**
 * UI が許容する scope choice 一覧。
 *
 * @remarks trust config export の allowedScopes 選択肢。Agent 側 method scope matrix
 * (`AgentControlPlaneScope`) と一致させる。
 */
export const TRUST_SCOPE_CHOICES = [
  'agent:read',
  'agent:write',
  'agent:tool:approve',
  'agent:integration:admin',
  'agent:admin',
  '*',
] as const;

/**
 * Trust config export form で提案する scope 選択肢。
 */
export type TrustScopeChoice = (typeof TRUST_SCOPE_CHOICES)[number];
