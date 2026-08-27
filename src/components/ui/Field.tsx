import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

/**
 * v1 kills Bootstrap's focus glow outright (`box-shadow: none`). We keep the
 * flat look on mouse focus but leave the keyboard ring alone — `focus-visible`
 * still paints the brand outline, so nothing gets lost for keyboard users.
 */
export const FIELD_CONTROL =
  'w-full rounded-card border border-line-strong bg-surface px-3 py-2 text-sm text-body ' +
  'placeholder:text-muted focus:border-line-strong focus:outline-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-70';

/** Label. Not uppercase micro-type any more — v1 uses a plain bold label. */
export const FIELD_LABEL = 'mb-1.5 block text-sm font-semibold text-body';

/**
 * An input welded to a trailing button (the ingredient autocomplete's `+`).
 * The seam is a single line: the input loses its right radius, the button its
 * left one, and the button pulls back a pixel so the borders overlap.
 */
export const GROUP_INPUT = 'rounded-r-none';
export const GROUP_BUTTON =
  '-ml-px shrink-0 rounded-card rounded-l-none border border-line-strong bg-surface px-3 ' +
  'text-body transition-colors hover:bg-hairline disabled:cursor-not-allowed disabled:opacity-70';

/** The suggestions popup shared by every autocomplete. */
export const SUGGESTION_LIST =
  'absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-card border border-line-strong bg-surface';
export const SUGGESTION_ITEM =
  'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-body hover:bg-hairline';

type Wrap = { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode };

export function Field({ label, hint, error, children }: Wrap) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-brand">
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
          className={cx(FIELD_CONTROL, mono && 'font-mono', className)}
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
          className={cx(FIELD_CONTROL, 'min-h-24 resize-y', className)}
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
        <select id={id} className={cx(FIELD_CONTROL, className)} {...rest}>
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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand"
      />
      {label}
    </label>
  );
}
