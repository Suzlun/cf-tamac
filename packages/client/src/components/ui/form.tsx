import { Slot } from '@radix-ui/react-slot';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
} from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { cn } from './cn';
import { Label } from './label';

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

interface FormFieldContextValue {
  readonly name: string;
}

/**
 * `react-hook-form` の `Controller` を shadcn/ui 形式で包む field component です。
 *
 * @param props - `Controller` に渡す `control`、`name`、`render` などの props です。
 * @returns field 名を context に載せ、子の `FormItem`/`FormLabel`/`FormControl`/`FormMessage` が同じ field を参照できる要素です。
 * @remarks
 * この component 自体は validation を実行せず、`react-hook-form` の resolver と field state を橋渡しします。
 * `FormItem` の外で使うと子の `useFormField` が error を投げるため、必ず shadcn Form composition 内で使います。
 *
 * @example
 * ```tsx
 * <FormField control={form.control} name="displayName" render={({ field }) => <Input {...field} />} />
 * ```
 */
export function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  ...props
}: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/**
 * shadcn Form の field context と item context から accessibility ID と field state を取得します。
 *
 * @returns input の `id`、description/message ID、field 名、`react-hook-form` の error/touched state を含む object です。
 * @throws `FormField` の外で呼ばれた場合、または `FormItem` の外で呼ばれた場合に error を投げます。
 * @remarks
 * `FormLabel`、`FormControl`、`FormDescription`、`FormMessage` が同じ ID 群を共有するための内部 hook です。
 * 直接 DOM を探さず、React context だけで関連付けを行います。
 */
const useFormField = () => {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const formContext = useFormContext();
  if (fieldContext === null) {
    throw new Error('useFormField must be used within <FormField>');
  }
  if (itemContext === null) {
    throw new Error('useFormField must be used within <FormItem>');
  }
  const { getFieldState, formState } = formContext;
  const fieldState = getFieldState(fieldContext.name, formState);

  const { name } = fieldContext;
  const { id } = itemContext;

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

const FormItemContext = createContext<FormItemContextValue | null>(null);

interface FormItemContextValue {
  readonly id: string;
}

/**
 * shadcn/ui 形式の form item container です。
 *
 * @param props - `div` に渡す className、children、HTML 属性です。
 * @param ref - container の `HTMLDivElement` ref です。
 * @returns 一意な ID を context に載せた field container を描画します。
 * @remarks
 * `useId` で生成した ID を `FormLabel`、`FormControl`、`FormDescription`、`FormMessage` が共有し、
 * `aria-describedby` と `htmlFor` の関連付けを保ちます。副作用は React の ID 生成だけです。
 */
export const FormItem = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = useId();
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('space-y-2 mb-5', className)} {...props} />
      </FormItemContext.Provider>
    );
  }
);
FormItem.displayName = 'FormItem';

/**
 * shadcn/ui 形式の form label です。
 *
 * @param props - label に渡す children、className、HTML 属性です。
 * @param ref - label の `HTMLLabelElement` ref です。
 * @returns `FormControl` の ID に紐づく label を描画します。
 * @throws `FormField` または `FormItem` の外で使うと context error が発生します。
 * @remarks
 * field に error がある場合は `data-error` と error color class を付け、視覚状態と支援技術向け関連付けを一致させます。
 */
export const FormLabel = forwardRef<HTMLLabelElement, HTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => {
    const { error, formItemId } = useFormField();
    return (
      <Label
        ref={ref}
        htmlFor={formItemId}
        data-error={error !== undefined}
        className={cn(error !== undefined && 'text-error', className)}
        {...props}
      />
    );
  }
);
FormLabel.displayName = 'FormLabel';

/**
 * shadcn/ui 形式の form control slot です。
 *
 * @param props - 子 input/select/textarea に合成する Slot props です。追加の `aria-describedby` も受け付けます。
 * @param ref - 合成先 control の ref です。
 * @returns 子 control へ `id`、`aria-describedby`、`aria-invalid` を注入した Slot を描画します。
 * @throws `FormField` または `FormItem` の外で使うと context error が発生します。
 * @remarks
 * default の description/message ID と caller が渡した追加説明 ID を結合します。これにより requested grants preview のような
 * field 外の補助 readout も、error message の読み上げを壊さず同じ control に関連付けられます。
 */
export const FormControl = forwardRef<
  ComponentRef<typeof Slot>,
  ComponentPropsWithoutRef<typeof Slot>
>(({ 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  const defaultDescribedBy =
    error !== undefined ? `${formDescriptionId} ${formMessageId}` : formDescriptionId;
  const describedBy = [defaultDescribedBy, ariaDescribedBy]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={describedBy}
      aria-invalid={error !== undefined}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

/**
 * shadcn/ui 形式の helper text です。
 *
 * @param props - helper text に渡す children、className、HTML 属性です。
 * @param ref - paragraph の `HTMLParagraphElement` ref です。
 * @returns `FormControl` の `aria-describedby` から参照される説明文を描画します。
 * @throws `FormField` または `FormItem` の外で使うと context error が発生します。
 * @remarks
 * validation を行わず、field の意図や入力例を説明するための静的/動的 copy を置く場所です。
 */
export const FormDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

/**
 * shadcn/ui 形式の field-level error message です。
 *
 * @param props - error text に渡す children、className、HTML 属性です。field error がある場合は error message を優先します。
 * @param ref - paragraph の `HTMLParagraphElement` ref です。
 * @returns error がある場合だけ `role="alert"` 付き message を描画し、error がない場合は `null` を返します。
 * @throws `FormField` または `FormItem` の外で使うと context error が発生します。
 * @remarks
 * wireframe §6.2 の accessibility 要件に合わせ、field-level error を即時に読み上げます。副作用はなく、表示内容は
 * `react-hook-form` の field state から取得します。
 */
export const FormMessage = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error !== undefined ? error.message : children;
    if (body === undefined || body === '') return null;
    return (
      <p
        ref={ref}
        id={formMessageId}
        role="alert"
        className={cn('text-sm text-error font-mono', className)}
        {...props}
      >
        {body}
      </p>
    );
  }
);
FormMessage.displayName = 'FormMessage';

export { FormProvider as Form, FormProvider, useFormContext, useFormField };
