import {
  REGISTRATION_FIELD_ORDER,
  type RegistrationFieldName,
  type RegistrationPolicyValidationResult,
  type RegistrationValues,
} from './schemas/agent-registration';

import type { FieldErrors, UseFormReturn } from 'react-hook-form';

/**
 * callback 契約外の policy validation 例外を Browser-safe four-field result へ変換します。
 *
 * @returns raw diagnostic を含まない固定安全 failure です。
 */
export function createPolicyValidationFailureResult(): RegistrationPolicyValidationResult {
  return {
    displayData: {
      fieldErrors: {},
      message: 'ポリシーの検証結果を確認できません。時間をおいてもう一度実行してください。',
      title: 'ポリシー検証結果を確認できません',
      warnings: [],
    },
    safeStatus: 'failed',
    safeErrorCategory: 'internal',
    correlationId: globalThis.crypto.randomUUID(),
  };
}

/**
 * Server Action が許可した登録 field error を RHF へ反映します。
 *
 * @param form - 登録フォームの RHF controller です。
 * @param fieldErrors - Server Action が safe projection した field error map です。
 * @returns 値を返しません。完了結果の見出しfocusを妨げないよう、field error associationだけを更新します。
 */
export function applyServerFieldErrors(
  form: UseFormReturn<RegistrationValues>,
  fieldErrors: Partial<Record<RegistrationFieldName, string>>
): void {
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    const message = Object.entries(fieldErrors).find(([key]) => key === fieldName)?.[1];
    if (message !== undefined) {
      form.setError(fieldName, { type: 'server', message });
    }
  }
}

/**
 * Browser validation error の最初の field へ schema 順で focus を移します。
 *
 * @param form - 登録フォームの RHF controller です。
 * @param fieldErrors - Browser validation が生成した nested error map です。
 * @returns 値を返さず、修正対象が存在する場合だけ focus を移します。
 */
export function focusFirstInvalidField(
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

/**
 * ValidationSummary が表示する登録 field の日本語ラベルを解決します。
 *
 * @param fieldName - 登録 schema の field 名です。
 * @returns 利用者へ表示する固定ラベルです。
 */
export function getRegistrationFieldLabel(fieldName: RegistrationFieldName): string {
  if (fieldName === 'agentId') return 'Agent ID';
  if (fieldName === 'agentRpcOrigin') return 'Agent RPC origin';
  if (fieldName === 'displayName') return '表示名';
  if (fieldName === 'displayOrder') return '表示順（任意）';
  if (fieldName === 'modelPolicy.policyRef') return 'ポリシー参照';
  if (fieldName === 'modelPolicy.provider') return 'プロバイダー';
  if (fieldName === 'modelPolicy.model') return 'モデルID';
  if (fieldName === 'modelPolicy.temperature') return '温度';
  if (fieldName === 'modelPolicy.topP') return 'Top P';
  if (fieldName === 'modelPolicy.maxOutputTokens') return '最大出力トークン数';
  if (fieldName === 'referenceValue') return 'credential参照';
  if (fieldName === 'keyId') return 'キーID';
  if (fieldName === 'publicFingerprint') return '公開フィンガープリント';
  if (fieldName === 'maskedHint') return 'マスク済みヒント';
  return '状態';
}

/**
 * 登録 field order に対応する nested RHF error を安全に取得します。
 *
 * @param fieldErrors - RHF が管理する登録 error map です。
 * @param fieldName - 固定 schema order の field 名です。
 * @returns 対象 field の error、または未検出時の undefined です。
 */
export function getFormFieldError(
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
