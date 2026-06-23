'use client';

import { useState } from 'react';

import { ConfirmDialog } from './confirm-dialog';
import { FormField } from './form-field';

interface AgentConfigSectionProps {
  readonly configVersion: string;
  readonly initialConfigJson: string;
  readonly pending: boolean;
  readonly onSave: (configJson: string) => Promise<boolean>;
}

/**
 * Config editor section of the Agent settings page.
 *
 * Toggles between read-only JSON preview and an editable textarea that
 * validates as JSON before submitting to `AgentStateService.UpdateConfig`.
 */
export function AgentConfigSection({
  configVersion,
  initialConfigJson,
  pending,
  onSave,
}: AgentConfigSectionProps) {
  const [configJson, setConfigJson] = useState(initialConfigJson);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSave = async () => {
    const saved = await onSave(configJson);
    if (saved) {
      setIsEditing(false);
      setConfirmOpen(false);
    }
  };

  return (
    <section className="readout" aria-labelledby="config-heading">
      <strong id="config-heading">Config</strong>
      <p>Current config version: v{configVersion}</p>
      <p className="form-helper">Changes are sent to AgentStateService.UpdateConfig.</p>
      <p aria-live="polite" className="form-helper">
        {isEditing ? 'Config editor active.' : 'Config editor read-only.'}
      </p>
      {isEditing ? (
        <ConfigEditor
          configJson={configJson}
          pending={pending}
          confirmOpen={confirmOpen}
          onChange={setConfigJson}
          onCancelEdit={() => {
            setIsEditing(false);
          }}
          onOpenConfirm={() => {
            setConfirmOpen(true);
          }}
          onCancelConfirm={() => {
            setConfirmOpen(false);
          }}
          onConfirm={handleSave}
        />
      ) : (
        <ConfigPreview
          configJson={configJson}
          pending={pending}
          onEdit={() => {
            setIsEditing(true);
          }}
        />
      )}
    </section>
  );
}

function ConfigEditor({
  configJson,
  pending,
  confirmOpen,
  onChange,
  onCancelEdit,
  onOpenConfirm,
  onCancelConfirm,
  onConfirm,
}: {
  readonly configJson: string;
  readonly pending: boolean;
  readonly confirmOpen: boolean;
  readonly onChange: (value: string) => void;
  readonly onCancelEdit: () => void;
  readonly onOpenConfirm: () => void;
  readonly onCancelConfirm: () => void;
  readonly onConfirm: () => Promise<void>;
}) {
  return (
    <>
      <FormField
        id="configJson"
        label="Config JSON"
        helper="Config JSON must parse before it is sent to the Agent Service."
        as="textarea"
        value={configJson}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        disabled={pending}
        rows={10}
        aria-label="Agent config JSON"
      />
      <div className="action-row">
        <button
          type="button"
          className="nav-link"
          onClick={onCancelEdit}
          disabled={pending}
          aria-disabled={pending}
        >
          Cancel edit
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={onOpenConfirm}
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? 'Saving…' : 'Save config'}
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        heading="Update config?"
        confirmLabel="Save config"
        onConfirm={onConfirm}
        onCancel={onCancelConfirm}
        pending={pending}
      >
        <p>This will create the next Agent config version.</p>
      </ConfirmDialog>
    </>
  );
}

function ConfigPreview({
  configJson,
  pending,
  onEdit,
}: {
  readonly configJson: string;
  readonly pending: boolean;
  readonly onEdit: () => void;
}) {
  return (
    <>
      <pre
        className="form-control"
        aria-label="Agent config JSON"
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {configJson}
      </pre>
      <div className="action-row">
        <button
          type="button"
          className="nav-link"
          onClick={onEdit}
          disabled={pending}
          aria-disabled={pending}
        >
          Edit config
        </button>
      </div>
    </>
  );
}
