import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

/** Small inline spinner. Never the whole answer to "loading" — see SkeletonGrid. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand',
        className,
      )}
    />
  );
}

/**
 * Loading on a list is skeleton cards, not a spinner — the layout should not
 * jump when the data lands.
 */
export function SkeletonCard() {
  return (
    <article
      // Matches RecipeCard down to the shadow, or the list pops when data lands.
      className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card"
      aria-hidden
    >
      <div className="h-[180px] w-full animate-pulse bg-hairline" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded-chip bg-hairline" />
        <div className="h-3 w-full animate-pulse rounded-chip bg-hairline" />
        <div className="h-3 w-2/3 animate-pulse rounded-chip bg-hairline" />
      </div>
    </article>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {message && <p className="mx-auto mt-2 max-w-md text-sm text-body">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Never surfaces the raw Postgres or Gemini error — that goes to the console. */
export function ErrorState({
  title = 'Algo salió mal',
  message = 'No pudimos cargar esto. Inténtalo de nuevo.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-card border border-brand bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-brand">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-body">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-card border border-line-strong bg-surface px-4 py-2 text-sm text-body transition-colors hover:bg-hairline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
