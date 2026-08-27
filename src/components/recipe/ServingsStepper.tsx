import { Minus, Plus, RotateCcw } from 'lucide-react';

type Props = {
  value: number;
  base: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
};

/** Drives the only animation on the page: the ledger's quantities. */
export function ServingsStepper({ value, base, onChange, min = 1, max = 100 }: Props) {
  const clamp = (n: number) => Math.min(Math.max(n, min), max);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-body">Porciones</span>

      <div className="flex items-center overflow-hidden rounded-card border border-line-strong">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label="Una porción menos"
          className="flex h-9 w-9 items-center justify-center text-body transition-colors hover:text-ink disabled:opacity-35"
        >
          <Minus size={15} aria-hidden />
        </button>

        <output
          aria-live="polite"
          className="w-12 border-x border-line-strong py-1.5 text-center font-mono text-base text-ink"
        >
          {value}
        </output>

        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label="Una porción más"
          className="flex h-9 w-9 items-center justify-center text-body transition-colors hover:text-ink disabled:opacity-35"
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>

      {value !== base && (
        <button
          type="button"
          onClick={() => onChange(base)}
          className="inline-flex items-center gap-1 text-xs text-body transition-colors hover:text-ink"
        >
          <RotateCcw size={12} aria-hidden />
          Volver a {base}
        </button>
      )}
    </div>
  );
}
