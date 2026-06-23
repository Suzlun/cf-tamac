import { cn } from './ui/cn';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface BaseFormFieldProps {
  readonly label: string;
  readonly helper?: string;
  readonly error?: string;
  readonly id: string;
  readonly className?: string;
}

type InputFormFieldProps = BaseFormFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
    readonly as?: 'input';
  };

type SelectFormFieldProps = BaseFormFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
    readonly as: 'select';
    readonly children: ReactNode;
  };

type TextAreaFormFieldProps = BaseFormFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
    readonly as: 'textarea';
  };

type FormFieldProps = InputFormFieldProps | SelectFormFieldProps | TextAreaFormFieldProps;

/**
 * label、helper text、error message を一体化した accessible form field。
 *
 * @param props - input/select/textarea の種別、label、helper、error、control props を含む field 設定。
 * @returns `aria-describedby` で helper/error を control に接続した form field。
 * @remarks
 * shadcn-style の `Label`、`Input`、`Select`、`Textarea` primitive を組み合わせる。
 * error node は wireframe の accessibility 指定に従い `role="alert"` で読み上げ対象にする。
 */
export function FormField(props: FormFieldProps) {
  const { label, helper, error, id, as = 'input', className, ...rest } = props;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const describedByParts: string[] = [];
  if (helper !== undefined && helper !== '') {
    describedByParts.push(helperId);
  }
  if (error !== undefined && error !== '') {
    describedByParts.push(errorId);
  }
  const describedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  const control =
    as === 'select' ? (
      <Select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {(rest as SelectFormFieldProps).children}
      </Select>
    ) : as === 'textarea' ? (
      <Textarea
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    ) : (
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      />
    );

  return (
    <div className={cn('mb-5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {helper !== undefined && helper !== '' ? (
        <p id={helperId} className="mt-1 text-sm text-muted-foreground">
          {helper}
        </p>
      ) : null}
      <div className="mt-1.5">{control}</div>
      {error !== undefined && error !== '' ? (
        <p id={errorId} className="mt-1 text-sm text-error font-mono" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
