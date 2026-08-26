import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

const CONTROL =
  'w-full border border-ceniza/35 bg-cal px-3 py-2 text-sm text-comal ' +
  'placeholder:text-ceniza/70 focus:border-comal focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

type Wrap = { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode };

export function Field({ label, hint, error, children }: Wrap) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-ceniza">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-ceniza">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-guajillo">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  mono?: boolean;
};

export function TextField({ label, hint, error, mono, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <input
          id={id}
          className={cx(CONTROL, mono && 'font-mono', className)}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </Field>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
};

export function TextArea({ label, hint, error, className, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <textarea
          id={id}
          className={cx(CONTROL, 'min-h-24 resize-y', className)}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
};

export function SelectField({ label, hint, error, className, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <select id={id} className={cx(CONTROL, className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-comal">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-guajillo"
      />
      {label}
    </label>
  );
}
