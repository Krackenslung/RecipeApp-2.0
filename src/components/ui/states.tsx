import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

/** Small inline spinner. Never the whole answer to "loading" — see SkeletonGrid. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-ceniza/40 border-t-comal',
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
    <article className="border border-ceniza/20 bg-cal" aria-hidden>
      <div className="aspect-[4/3] w-full animate-pulse bg-ceniza/15" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse bg-ceniza/15" />
        <div className="h-3 w-full animate-pulse bg-ceniza/10" />
        <div className="h-3 w-2/3 animate-pulse bg-ceniza/10" />
      </div>
    </article>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    <div className="border border-dashed border-ceniza/35 px-6 py-16 text-center">
      <h2 className="font-display text-xl font-black tracking-tight text-comal">{title}</h2>
      {message && <p className="mx-auto mt-2 max-w-md text-sm text-ceniza">{message}</p>}
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
    <div className="border border-guajillo/35 bg-cal px-6 py-12 text-center">
      <h2 className="font-display text-lg font-black tracking-tight text-guajillo">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ceniza">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 border border-ceniza/40 px-4 py-2 text-sm text-comal transition-colors hover:border-comal"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
