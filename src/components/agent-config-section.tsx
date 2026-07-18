'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { type FieldErrors, type UseFormReturn, useForm } from 'react-hook-form';

import { ConfirmDialog } from './confirm-dialog';
import { agentConfigSchema, type AgentConfigValues } from './schemas/agent-settings';
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
import { Textarea } from './ui/textarea';

interface AgentConfigSectionProps {
  readonly configVersion: string;
  readonly initialConfigJson: string;
  readonly pending: boolean;
  readonly onSave: (configJson: string) => Promise<boolean>;
}

/**
 * Agent settings 画面の config editor section を描画します。
 *
 * @param configVersion - Server Component が Agent RPC から取得した現在の config version です。
 * @param initialConfigJson - 初期表示に使う browser-safe config JSON 文字列です。Client D1 には永続化しません。
 * @param pending - 親 settings form が mutation 実行中かどうかを示す flag です。`true` の間は入力と確定操作を止めます。
 * @param onSave - Zod validation を通過した JSON 文字列を親へ渡す callback です。親が Server Action 経由で Agent RPC を呼びます。
 * @returns read-only preview、RHF/Zod textarea、config update confirmation dialog を含む section を返します。
 * @remarks
 * `react-hook-form`、`zodResolver(agentConfigSchema)`、shadcn `Form` primitives で構成します。Browser では Agent RPC client、
 * credential、Connect transport を import せず、Server Action wrapper だけに submit を委譲します。
 * invalid JSON は `FormMessage` の `role="alert"` で field に紐づけて表示し、confirm dialog は validation 通過後だけ開きます。
 *
 * @example
 * ```tsx
 * <AgentConfigSection
 *   configVersion="42"
 *   initialConfigJson="{}"
 *   pending={false}
 *   onSave={saveConfigThroughServerAction}
 * />
 * ```
 */
export function AgentConfigSection({
  configVersion,
  initialConfigJson,
  pending,
  onSave,
}: AgentConfigSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const form = useForm<AgentConfigValues>({
    resolver: zodResolver(agentConfigSchema),
    defaultValues: { configJson: initialConfigJson },
    mode: 'onChange',
    shouldFocusError: true,
  });
  const configJson = form.watch('configJson');

  useEffect(() => {
    // Server refresh で config が更新された場合、編集中でなければ preview/form の source を最新値へ揃える。
    if (!isEditing) {
      form.reset({ configJson: initialConfigJson });
    }
  }, [form, initialConfigJson, isEditing]);

  const handleCancelEdit = (): void => {
    // cancel は未保存 draft を捨て、Agent RPC から取得した現在値だけを preview に戻す。
    form.reset({ configJson: initialConfigJson });
    setIsEditing(false);
  };

  const handleConfirm = async (): Promise<void> => {
    // dialog 表示後も念のため再検証し、validation を迂回した確定操作を Server Action へ渡さない。
    const valid = await form.trigger('configJson');
    if (!valid) {
      setConfirmOpen(false);
      form.setFocus('configJson');
      return;
    }
    const configDraft = form.getValues('configJson');
    const saved = await onSave(configDraft);
    if (saved) {
      // 保存成功時だけ editor を閉じ、Server refresh までの間も preview が送信済み JSON を示すように同期する。
      form.reset({ configJson: configDraft });
      setIsEditing(false);
      setConfirmOpen(false);
    }
  };

  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="config-heading"
    >
      <strong id="config-heading">Config</strong>
      <p>Current config version: v{configVersion}</p>
      <p className="text-xs text-muted-foreground">
        Changes are sent to AgentStateService.UpdateConfig. Default model policy is managed above;
        config JSON updates cannot override modelPolicyRef.
      </p>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {isEditing ? 'Config editor active.' : 'Config editor read-only.'}
      </p>
      {isEditing ? (
        <ConfigEditor
          form={form}
          pending={pending}
          confirmOpen={confirmOpen}
          onCancelEdit={handleCancelEdit}
          onOpenConfirm={() => {
            setConfirmOpen(true);
          }}
          onCancelConfirm={() => {
            setConfirmOpen(false);
          }}
          onConfirm={handleConfirm}
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

interface ConfigEditorProps {
  readonly form: UseFormReturn<AgentConfigValues>;
  readonly pending: boolean;
  readonly confirmOpen: boolean;
  readonly onCancelEdit: () => void;
  readonly onOpenConfirm: () => void;
  readonly onCancelConfirm: () => void;
  readonly onConfirm: () => Promise<void>;
}

function ConfigEditor({
  form,
  pending,
  confirmOpen,
  onCancelEdit,
  onOpenConfirm,
  onCancelConfirm,
  onConfirm,
}: ConfigEditorProps) {
  const handleInvalidSubmit = (fieldErrors: FieldErrors<AgentConfigValues>): void => {
    // invalid submit は shadcn FormMessage に field error を表示し、最初の invalid field に focus を戻す。
    focusFirstInvalidConfigField(form, fieldErrors);
  };

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={(event) => {
            // submit は dialog を開くだけに留め、実際の Server Action は ConfirmDialog の明示操作後に呼ぶ。
            void form.handleSubmit(onOpenConfirm, handleInvalidSubmit)(event);
          }}
          noValidate
        >
          <RhfFormField
            control={form.control}
            name="configJson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Config JSON</FormLabel>
                <FormDescription>
                  Config JSON must parse before it is sent to the Agent Service.
                </FormDescription>
                <FormControl>
                  <Textarea
                    {...field}
                    disabled={pending}
                    rows={10}
                    aria-label="Agent config JSON"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onCancelEdit} disabled={pending}>
              Cancel edit
            </Button>
            <Button type="submit" variant="default" disabled={pending} aria-disabled={pending}>
              {pending ? 'Saving…' : 'Save config'}
            </Button>
          </div>
        </form>
      </Form>
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
        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        aria-label="Agent config JSON"
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {configJson}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onEdit} disabled={pending}>
          Edit config
        </Button>
      </div>
    </>
  );
}

function focusFirstInvalidConfigField(
  form: UseFormReturn<AgentConfigValues>,
  fieldErrors: FieldErrors<AgentConfigValues>
): void {
  // config editor は単一 field なので、動的 property access を使わず安全に focus を戻す。
  if (fieldErrors.configJson !== undefined) {
    form.setFocus('configJson');
  }
}
