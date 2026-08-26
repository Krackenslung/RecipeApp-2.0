import { useId } from 'react';
import { Checkbox } from '@/components/ui/Field';

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
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-ceniza">
          {label}
        </label>
        <span className="font-mono text-xs text-comal">{active ? format(value) : 'sin límite'}</span>
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
        className="w-full accent-guajillo disabled:opacity-40"
      />

      <Checkbox
        label={<span className="text-xs text-ceniza">Aplicar este límite</span>}
        checked={active}
        onChange={(on) => onChange(on ? max : null)}
      />
    </div>
  );
}

type CostProps = {
  value: number | null;
  onChange: (next: number | null) => void;
  perServing: boolean;
  onPerServingChange: (next: boolean) => void;
};

/**
 * Cost is the one filter with a second dimension. p_cost_per_serving only
 * travels with p_max_cost — on its own it means nothing to the RPC.
 */
export function CostField({ value, onChange, perServing, onPerServingChange }: CostProps) {
  return (
    <div className="flex flex-col gap-2">
      <RangeField
        label="Costo máximo"
        value={value}
        onChange={onChange}
        min={20}
        max={1000}
        step={10}
        format={(n) => `$${n}`}
      />
      <Checkbox
        label={<span className="text-xs text-ceniza">Por porción, no por receta</span>}
        checked={perServing}
        disabled={value == null}
        onChange={onPerServingChange}
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ceniza">Porciones</span>
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
          className="w-full border border-ceniza/35 bg-cal px-2 py-1.5 font-mono text-sm text-comal placeholder:font-body placeholder:text-ceniza/70 focus:border-comal focus:outline-none"
        />
        <span className="text-ceniza">–</span>
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
          className="w-full border border-ceniza/35 bg-cal px-2 py-1.5 font-mono text-sm text-comal placeholder:font-body placeholder:text-ceniza/70 focus:border-comal focus:outline-none"
        />
      </div>
    </div>
  );
}
