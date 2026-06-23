'use client';

import { useState, type ChangeEvent } from 'react';

import { ConfirmDialog } from './confirm-dialog';
import { FormField } from './form-field';
import { SignalBadge } from './signal-badge';

interface RotateResult {
  readonly referenceValue: string;
  readonly keyId: string;
  readonly fingerprintValue: string;
  readonly maskedHint: string;
}

interface CurrentCredentialView {
  readonly status: string;
  readonly keyId?: string;
  readonly generation?: number;
  readonly maskedHint?: string;
}

interface CredentialRotationSectionProps {
  readonly actingOperatorId: string;
  readonly currentCredential?: CurrentCredentialView;
  readonly pending: boolean;
  readonly onRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly onSaveReference: (result: RotateResult) => Promise<boolean>;
}

/**
 * Credential rotation section of the Agent settings page.
 *
 * Shows the rotate button, confirmation dialog, and the new reference form
 * that appears after a successful rotation. The reference fields capture
 * opaque lookup metadata, never plaintext secrets.
 */
export function CredentialRotationSection({
  actingOperatorId,
  currentCredential,
  pending,
  onRotate,
  onSaveReference,
}: CredentialRotationSectionProps) {
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [rotateResult, setRotateResult] = useState<RotateResult | undefined>();
  const canSaveReference =
    rotateResult !== undefined &&
    rotateResult.referenceValue !== '' &&
    rotateResult.keyId !== '' &&
    rotateResult.fingerprintValue !== '' &&
    rotateResult.maskedHint !== '';

  const handleRotate = async () => {
    const result = await onRotate();
    if (result !== undefined) {
      setRotateResult({ referenceValue: '', keyId: '', fingerprintValue: '', maskedHint: '' });
      setRotateDialogOpen(false);
    }
  };

  const updateField =
    (field: keyof RotateResult) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setRotateResult((prev) => (prev === undefined ? prev : { ...prev, [field]: value }));
    };

  const handleSaveNewReference = async () => {
    if (rotateResult === undefined) return;
    const saved = await onSaveReference(rotateResult);
    if (saved) {
      setRotateResult(undefined);
    }
  };

  return (
    <section className="readout" aria-labelledby="credential-heading">
      <strong id="credential-heading">Credential rotation</strong>
      <CurrentCredentialSummary credential={currentCredential} />
      <button
        type="button"
        className="primary-action"
        onClick={() => {
          setRotateDialogOpen(true);
        }}
        disabled={pending}
        aria-disabled={pending}
      >
        Rotate credential
      </button>
      {rotateResult !== undefined ? (
        <NewReferenceForm
          rotateResult={rotateResult}
          pending={pending}
          canSaveReference={canSaveReference}
          onFieldChange={updateField}
          onSave={handleSaveNewReference}
        />
      ) : null}

      <ConfirmDialog
        open={rotateDialogOpen}
        heading="Rotate Agent credential?"
        confirmLabel="Rotate"
        onConfirm={handleRotate}
        onCancel={() => {
          setRotateDialogOpen(false);
        }}
        pending={pending}
      >
        <p>
          A new credential generation will become active. The previous generation remains valid
          during the overlap window.
        </p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
    </section>
  );
}

function NewReferenceForm({
  rotateResult,
  pending,
  canSaveReference,
  onFieldChange,
  onSave,
}: {
  readonly rotateResult: RotateResult;
  readonly pending: boolean;
  readonly canSaveReference: boolean;
  readonly onFieldChange: (
    field: keyof RotateResult
  ) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  readonly onSave: () => Promise<void>;
}) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="eyebrow">New reference</p>
      <FormField
        id="newCredentialRef"
        label="New credential reference"
        value={rotateResult.referenceValue}
        onChange={onFieldChange('referenceValue')}
        disabled={pending}
        autoComplete="off"
        required
      />
      <FormField
        id="newKeyId"
        label="New key ID"
        value={rotateResult.keyId}
        onChange={onFieldChange('keyId')}
        disabled={pending}
        autoComplete="off"
        required
      />
      <FormField
        id="newPublicFingerprint"
        label="New public fingerprint"
        value={rotateResult.fingerprintValue}
        onChange={onFieldChange('fingerprintValue')}
        disabled={pending}
        autoComplete="off"
        required
      />
      <FormField
        id="newMaskedHint"
        label="New masked hint"
        value={rotateResult.maskedHint}
        onChange={onFieldChange('maskedHint')}
        disabled={pending}
        autoComplete="off"
        required
      />
      <button
        type="button"
        className="primary-action"
        onClick={() => {
          void onSave();
        }}
        disabled={pending || !canSaveReference}
        aria-disabled={pending || !canSaveReference}
      >
        Save new reference
      </button>
    </div>
  );
}

function CurrentCredentialSummary({ credential }: { readonly credential?: CurrentCredentialView }) {
  return (
    <div className="readout" aria-label="Current credential" style={{ marginBottom: '1rem' }}>
      <strong>Current credential</strong>
      <p>generation {credential?.generation ?? '—'}</p>
      <p>
        status:{' '}
        <SignalBadge
          label={(credential?.status ?? 'unknown').toUpperCase()}
          variant={credential?.status === 'active' ? 'signal' : 'muted'}
        />
      </p>
      <p>key id: {credential?.keyId ?? '—'}</p>
      <p>masked hint: {credential?.maskedHint ?? '—'}</p>
    </div>
  );
}
