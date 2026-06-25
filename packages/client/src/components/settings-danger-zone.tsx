'use client';

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
import { Input } from './ui/input';

import type { DestroyConfirmValues } from './schemas/agent-settings';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Agent destroy confirmation field の props です。
 *
 * @remarks
 * Browser では確認用 Agent ID echo だけを扱います。破壊操作の Server Action、冪等性 key、reason は
 * 親 settings form に閉じ、ここでは direct Agent RPC を行いません。
 */
export interface DestroyConfirmFieldProps {
  readonly form: UseFormReturn<DestroyConfirmValues>;
  readonly agentId: string;
  readonly pending: boolean;
  readonly onConfirm: () => Promise<void>;
}

/**
 * Destroy confirmation dialog 内の type-to-confirm form を描画します。
 *
 * @param props - destroy confirmation form、Agent ID、pending 状態、confirm callback を含む props です。
 * @returns Agent ID 完全一致を求める input form を返します。
 */
export function DestroyConfirmField({
  form,
  agentId,
  pending,
  onConfirm,
}: DestroyConfirmFieldProps) {
  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          // Enter submit でも ConfirmDialog と同じ validation/Server Action path に統一する。
          event.preventDefault();
          void onConfirm();
        }}
        noValidate
      >
        <RhfFormField
          control={form.control}
          name="confirmAgentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{`Type the Agent ID "${agentId}" to confirm`}</FormLabel>
              <FormDescription>
                Destroy confirmation is enabled only when the value exactly matches this Agent ID.
              </FormDescription>
              <FormControl>
                <Input {...field} disabled={pending} autoComplete="off" required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

/**
 * Danger zone section の props です。
 *
 * @remarks
 * destroy dialog を開く button だけを持ち、Agent RPC や credential 情報は扱いません。
 */
export interface DangerZoneSectionProps {
  readonly pending: boolean;
  readonly onOpenDestroyDialog: () => void;
}

/**
 * Settings 画面の Danger zone button を描画します。
 *
 * @param props - pending 状態と dialog open callback を含む props です。
 * @returns destructive action を明示する readout section を返します。
 */
export function DangerZoneSection({ pending, onOpenDestroyDialog }: DangerZoneSectionProps) {
  return (
    <section className="readout" aria-labelledby="danger-heading">
      <strong id="danger-heading">Danger zone</strong>
      <Button
        type="button"
        variant="destructive"
        onClick={onOpenDestroyDialog}
        disabled={pending}
        aria-disabled={pending}
      >
        Destroy Agent
      </Button>
    </section>
  );
}
