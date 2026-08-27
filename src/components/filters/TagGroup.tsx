import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/Chip';

type Item = { id: number; name: string };

type Props = {
  label: string;
  items: Item[];
  value: number[];
  onChange: (next: number[]) => void;
  tone?: 'neutral' | 'diet' | 'accent';
  /**
   * How the RPC combines the selection. Surfaced because "vegana" + "keto"
   * returns nothing and the user will otherwise read that as a bug.
   */
  combinator?: 'ANY' | 'ALL' | 'NONE';
  note?: ReactNode;
};

const COMBINATOR_COPY: Record<'ANY' | 'ALL' | 'NONE', string> = {
  ANY: 'any of the checked',
  ALL: 'must satisfy all',
  NONE: 'all excluded',
};

export function TagGroup({ label, items, value, onChange, tone = 'neutral', combinator, note }: Props) {
  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-semibold text-body">
        <span>{label}</span>
        {combinator && (
          <span className="text-xs font-normal text-muted">{COMBINATOR_COPY[combinator]}</span>
        )}
      </legend>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Chip
            key={item.id}
            tone={tone}
            selected={value.includes(item.id)}
            onToggle={() => toggle(item.id)}
          >
            {item.name}
          </Chip>
        ))}
      </div>

      {note && <p className="text-xs text-muted">{note}</p>}
    </fieldset>
  );
}
