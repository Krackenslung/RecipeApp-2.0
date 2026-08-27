import { useId } from 'react';
import { Checkbox, FIELD_CONTROL, FIELD_LABEL } from '@/components/ui/Field';
import { cx } from '@/utils/cx';

type Props = {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  min: number;
  max: number;
  step?: number;
  /** How the number reads once set — "45 min", "600 kcal". */
  format: (n: number) => string;
};

/**
 * A "no more than X" filter. null is the no-constraint value, so the slider is
 * paired with an explicit off state — 0 is a real constraint that returns
 * nothing, and a slider alone has no way to say "I don't care".
 */
export function RangeField({ label, value, onChange, min, max, step = 1, format }: Props) {
  const id = useId();
  const active = value != null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={cx(FIELD_LABEL, 'mb-0')}>
          {label}
        </label>
        <span className="font-mono text-xs text-muted">
          {active ? format(value) : 'sin límite'}
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? max}
        disabled={!active}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand disabled:opacity-40"
      />

      <Checkbox
        label={<span className="text-xs text-muted">Aplicar este límite</span>}
        checked={active}
        onChange={(on) => onChange(on ? max : null)}
      />
    </div>
  );
}

type ServingsProps = {
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
};

export function ServingsRange({ min, max, onChange }: ServingsProps) {
  return (
    <div className="flex flex-col">
      <span className={FIELD_LABEL}>Porciones</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={100}
          value={min ?? ''}
          placeholder="mín"
          aria-label="Porciones mínimas"
          onChange={(e) =>
            onChange({ min: e.target.value === '' ? null : Number(e.target.value), max })
          }
          className={cx(FIELD_CONTROL, 'font-mono placeholder:font-body')}
        />
        <span className="text-muted">–</span>
        <input
          type="number"
          min={1}
          max={100}
          value={max ?? ''}
          placeholder="máx"
          aria-label="Porciones máximas"
          onChange={(e) =>
            onChange({ min, max: e.target.value === '' ? null : Number(e.target.value) })
          }
          className={cx(FIELD_CONTROL, 'font-mono placeholder:font-body')}
        />
      </div>
    </div>
  );
}
