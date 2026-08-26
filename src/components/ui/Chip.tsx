import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/utils/cx';

type Tone = 'neutral' | 'diet' | 'accent';

const TONES: Record<Tone, { off: string; on: string }> = {
  neutral: {
    off: 'border-ceniza/30 text-ceniza hover:border-comal hover:text-comal',
    on: 'border-comal bg-comal text-cal',
  },
  // tomatillo is for success and dietary badges only.
  diet: {
    off: 'border-tomatillo/40 text-tomatillo hover:border-tomatillo',
    on: 'border-tomatillo bg-tomatillo text-cal',
  },
  accent: {
    off: 'border-guajillo/40 text-guajillo hover:border-guajillo',
    on: 'border-guajillo bg-guajillo text-cal',
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
        'inline-flex items-center gap-1.5 border px-2.5 py-1 text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
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
        'inline-flex items-center gap-1.5 border px-2.5 py-1 text-sm',
        TONES[tone].on,
      )}
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${label}`}
        className="opacity-70 transition-opacity hover:opacity-100"
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  );
}

/** Read-only label — cuisines and diets on a card. Never interactive. */
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center border px-2 py-0.5 text-xs',
        tone === 'diet'
          ? 'border-tomatillo/40 text-tomatillo'
          : 'border-ceniza/30 text-ceniza',
      )}
    >
      {children}
    </span>
  );
}
