import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/utils/cx';

type Tone = 'neutral' | 'diet' | 'accent';

const TONES: Record<Tone, { off: string; on: string }> = {
  neutral: {
    off: 'border-line-strong bg-surface text-body hover:bg-hairline',
    on: 'border-brand bg-brand text-white',
  },
  // Dietary badges carry the success green.
  diet: {
    off: 'border-line-strong bg-surface text-body hover:bg-hairline',
    on: 'border-success bg-success text-white',
  },
  accent: {
    off: 'border-line-strong bg-surface text-body hover:bg-hairline',
    on: 'border-brand bg-brand text-white',
  },
};

type ToggleProps = {
  selected?: boolean;
  tone?: Tone;
  onToggle?: () => void;
  disabled?: boolean;
  children: ReactNode;
};

/** A filter value. Pressed state is real state, so it carries aria-pressed. */
export function Chip({ selected = false, tone = 'neutral', onToggle, disabled, children }: ToggleProps) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-70',
        selected ? t.on : t.off,
      )}
    >
      {children}
    </button>
  );
}

/** A chosen value with a way out — ingredients picked from the autocomplete. */
export function RemovableChip({
  tone = 'neutral',
  onRemove,
  label,
  children,
}: {
  tone?: Tone;
  onRemove: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2 py-0.5 text-xs',
        tone === 'neutral' ? 'bg-hairline text-body' : TONES[tone].on,
      )}
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${label}`}
        className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
      >
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

/** Read-only label — cuisines and diets on a card. Never interactive. */
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-chip px-2 py-0.5 text-xs',
        tone === 'diet' ? 'bg-hairline text-success' : 'bg-hairline text-body',
      )}
    >
      {children}
    </span>
  );
}
