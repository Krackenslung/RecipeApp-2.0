import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useIngredientNames, useIngredientSearch } from '@/queries/useIngredientSearch';
import { RemovableChip } from '@/components/ui/Chip';
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
      <label
        htmlFor={`${listId}-input`}
        className="text-xs font-medium uppercase tracking-wide text-ceniza"
      >
        {label}
      </label>

      <div className="relative">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ceniza"
        />
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
          className="w-full border border-ceniza/35 bg-cal py-2 pl-8 pr-8 text-sm text-comal placeholder:text-ceniza/70 focus:border-comal focus:outline-none"
        />
        {isFetching && (
          <Spinner className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        )}

        {open && options.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-auto border border-ceniza/30 bg-cal"
          >
            {options.map((hit, i) => (
              <li key={hit.ingredient_id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(hit.ingredient_id)}
                  className={cx(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
                    i === active ? 'bg-masa text-comal' : 'text-ceniza',
                  )}
                >
                  {hit.name}
                  {!hit.is_verified && (
                    <span className="text-[10px] uppercase tracking-wide text-ceniza/70">
                      sin verificar
                    </span>
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
