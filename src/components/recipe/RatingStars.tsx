import { useState } from 'react';
import { Star } from 'lucide-react';
import { cx } from '@/utils/cx';

type Props = {
  /** The user's own vote, or null. */
  value: number | null;
  onRate?: (rating: number) => void;
  onClear?: () => void;
  readOnly?: boolean;
  size?: number;
};

export function RatingStars({ value, onRate, onClear, readOnly = false, size = 20 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value ?? 0} de 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            aria-hidden
            className={n <= shown ? 'text-brand' : 'text-muted'}
            fill={n <= shown ? 'currentColor' : 'none'}
          />
        ))}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            aria-pressed={value === n}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onRate?.(n)}
            className="transition-transform hover:scale-110"
          >
            <Star
              size={size}
              aria-hidden
              className={cx(n <= shown ? 'text-brand' : 'text-muted')}
              fill={n <= shown ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>

      {value != null && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-body transition-colors hover:text-ink"
        >
          Clear
        </button>
      )}
    </div>
  );
}
