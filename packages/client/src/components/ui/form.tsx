'use client';

import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Label } from '@cf-tamac/client/components/ui/label';
import { cn } from '@cf-tamac/client/lib/utils';

import type * as LabelPrimitive from '@radix-ui/react-label';

// react-hook-form の provider を Shadcn form primitive の公開名として再公開し、既存 form state を下位 field へ流す。
const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

/**
 * react-hook-form の Controller と field name context を結び付けます。
 *
 * @param props - Controller に渡す field name、control、render などの設定です。
 * @returns FormFieldContext を伴う Controller を返します。
 */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    // field name を context 化し、Label/Control/Message が同じ field state と aria ID を参照できるようにする。
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

/**
 * 現在の FormField/FormItem から field state と ARIA ID を導出します。
 *
 * @returns field name、item/control/description/message ID、react-hook-form の field state を返します。
 * @throws `FormField` または `FormItem` の外で呼ばれた場合は、ARIA 関連付けが作れないため例外を投げます。
 */
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (fieldContext === null) {
    // field name が無いと getFieldState の対象を特定できないため、誤った構成を即時に失敗させる。
    throw new Error('useFormField should be used within <FormField>');
  }

  if (itemContext === null) {
    // FormItem の id が無いと label/control/message の ARIA 関連付けが壊れるため、誤った構成を即時に失敗させる。
    throw new Error('useFormField should be used within <FormItem>');
  }

  // react-hook-form の現在 state から、この field だけの error/touched/dirty などを切り出す。
  const fieldState = getFieldState(fieldContext.name, formState);

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

/**
 * 1つの form field block を表す wrapper です。
 *
 * @returns 子要素へ安定した React ID を提供し、label/control/message の関連付け単位を作ります。
 */
const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    // useId は SSR/Client で一致する ID を生成し、hydration 後も ARIA 参照を安定させる。
    const id = React.useId();

    return (
      // item id を context 化し、子の Label/Control/Description/Message が同じ ID prefix を共有する。
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('space-y-2', className)} {...props} />
      </FormItemContext.Provider>
    );
  }
);
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  // error 状態と control ID を取得し、label の色と htmlFor を field state に同期する。
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(error != null && 'text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<
  React.ComponentRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  // control は field の説明文とエラー文の ID を受け取り、screen reader が入力状態を追えるようにする。
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  // aria-describedby 用の参照先を組み立てる。error 時は description と message の両方を参照する。
  const describedBy = error == null ? formDescriptionId : `${formDescriptionId} ${formMessageId}`;

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={describedBy}
      aria-invalid={error != null}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  // description は control の aria-describedby から常に参照される補助説明として ID を固定する。
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-[0.8rem] text-muted-foreground', className)}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  // error がある場合は react-hook-form の message を優先し、無い場合だけ明示 children を表示する。
  const { error, formMessageId } = useFormField();
  const body = error != null ? (error.message ?? '') : children;

  if (body == null || body === '') {
    // 表示すべき message が無い場合は空要素を残さず、screen reader に不要な alert を出さない。
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-[0.8rem] font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
