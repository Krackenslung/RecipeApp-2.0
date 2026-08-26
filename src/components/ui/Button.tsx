import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/utils/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * This component decides what a button looks like. Nothing else in the app
 * writes these class strings — that is what stops them drifting across files.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-none font-body font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-45 select-none';

const VARIANTS: Record<Variant, string> = {
  // guajillo is the single accent — one primary per screen.
  primary: 'bg-guajillo text-cal hover:bg-comal',
  secondary: 'border border-ceniza/40 bg-cal text-comal hover:border-comal',
  ghost: 'text-ceniza hover:text-comal',
  danger: 'border border-guajillo/50 text-guajillo hover:bg-guajillo hover:text-cal',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={cx(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

type LinkProps = {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

/** Same vocabulary, rendered as a link — a navigation is not a button. */
export function ButtonLink({ to, variant = 'secondary', size = 'md', className, children }: LinkProps) {
  return (
    <Link to={to} className={cx(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}
