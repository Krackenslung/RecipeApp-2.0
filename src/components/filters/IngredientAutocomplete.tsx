import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useIngredientNames, useIngredientSearch } from '@/queries/useIngredientSearch';
import { RemovableChip } from '@/components/ui/Chip';
import {
  FIELD_CONTROL,
  FIELD_LABEL,
  GROUP_BUTTON,
  GROUP_INPUT,
  SUGGESTION_ITEM,
  SUGGESTION_LIST,
} from '@/components/ui/Field';
import { Spinner } from '@/components/ui/states';
import { cx } from '@/utils/cx';

type Props = {
  label: string;
  placeholder?: string;
  tone?: 'neutral' | 'accent';
  value: number[];
  onChange: (next: number[]) => void;
};

/**
 * Stores ingredient_id, never the name. The label is display only — a name sent
 * to search_recipes() silently matches nothing.
 */
export function IngredientAutocomplete({
  label,
  placeholder = 'Escribe un ingrediente',
  tone = 'neutral',
  value,
  onChange,
}: Props) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 200);
    return () => clearTimeout(t);
  }, [term]);

  const { data: hits, isFetching } = useIngredientSearch(debounced);
  // The selected ids may have arrived from a URL or from saved preferences,
  // with no label attached — resolve them so the chips can say something.
  const { data: selectedNames } = useIngredientNames(value);

  const labels = useMemo(() => {
    const map = new Map<number, string>();
    for (const i of selectedNames ?? []) map.set(i.ingredient_id, i.name);
    for (const i of hits ?? []) map.set(i.ingredient_id, i.name);
    return map;
  }, [selectedNames, hits]);

  const options = (hits ?? []).filter((h) => !value.includes(h.ingredient_id));

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  function add(id: number) {
    if (!value.includes(id)) onChange([...value, id]);
    setTerm('');
    setDebounced('');
    setOpen(false);
    setActive(0);
  }

  return (
    <div ref={boxRef} className="flex flex-col gap-2">
      <label htmlFor={`${listId}-input`} className={FIELD_LABEL}>
        {label}
      </label>

      {/* Input welded to a `+`, as in v1. The button commits the highlighted
          suggestion, which is what Enter already does. */}
      <div className="relative flex">
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={term}
          placeholder={placeholder}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!options.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % options.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + options.length) % options.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const hit = options[active];
              if (hit) add(hit.ingredient_id);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cx(FIELD_CONTROL, GROUP_INPUT, isFetching && 'pr-8')}
        />
        {isFetching && (
          <Spinner className="absolute right-14 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        )}

        <button
          type="button"
          aria-label={`Agregar a ${label.toLowerCase()}`}
          disabled={options.length === 0}
          onClick={() => {
            const hit = options[active] ?? options[0];
            if (hit) add(hit.ingredient_id);
          }}
          className={GROUP_BUTTON}
        >
          <Plus size={16} aria-hidden />
        </button>

        {open && options.length > 0 && (
          <ul id={listId} role="listbox" className={cx(SUGGESTION_LIST, 'top-full')}>
            {options.map((hit, i) => (
              <li key={hit.ingredient_id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(hit.ingredient_id)}
                  className={cx(SUGGESTION_ITEM, i === active && 'bg-hairline text-ink')}
                >
                  {hit.name}
                  {!hit.is_verified && (
                    <span className="text-xs text-muted">sin verificar</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <RemovableChip
              key={id}
              tone={tone}
              label={labels.get(id) ?? `#${id}`}
              onRemove={() => onChange(value.filter((v) => v !== id))}
            >
              {labels.get(id) ?? `#${id}`}
            </RemovableChip>
          ))}
        </div>
      )}
    </div>
  );
}
