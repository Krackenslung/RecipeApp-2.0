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
  /**
   * Free text the user typed that the catalog does not know. Only meaningful
   * where the filters feed a generation — see `allowFreeText`.
   */
  names?: string[];
  onNamesChange?: (next: string[]) => void;
  /**
   * Off by default, and off on the feed. search_recipes() joins on
   * ingredient_id, so a typed name cannot narrow a search: offering it there
   * would put a chip on screen that changes nothing, which is worse than the
   * silence it replaces. On /generate the model reads the raw text, so it is
   * real input.
   */
  allowFreeText?: boolean;
};

/**
 * Catalog matches are stored as ingredient_id, never as a name — a name sent to
 * search_recipes() silently matches nothing.
 *
 * Anything the catalog does not recognise can still be added, as free text, the
 * way 1.0 worked: you typed an ingredient and the model sorted out the
 * spelling. Those travel separately and are visibly provisional.
 */
export function IngredientAutocomplete({
  label,
  placeholder = 'Type an ingredient',
  tone = 'neutral',
  value,
  onChange,
  names = [],
  onNamesChange,
  allowFreeText = false,
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

  const typed = term.trim();
  // Only once the debounce has caught up, or the message flashes "no matches"
  // against a stale result set on every keystroke.
  const settled = debounced.trim() === typed && !isFetching;
  const noMatches = typed.length > 1 && settled && options.length === 0;
  const alreadyAdded = names.some((n) => n.toLowerCase() === typed.toLowerCase());
  const canAddFreeText = allowFreeText && noMatches && !alreadyAdded && Boolean(onNamesChange);

  function reset() {
    setTerm('');
    setDebounced('');
    setOpen(false);
    setActive(0);
  }

  function add(id: number) {
    if (!value.includes(id)) onChange([...value, id]);
    reset();
  }

  function addFreeText() {
    if (!canAddFreeText || !onNamesChange) return;
    onNamesChange([...names, typed]);
    reset();
  }

  /** What the `+` and Enter both do: whichever of the two is available. */
  function commit() {
    const hit = options[active] ?? options[0];
    if (hit) add(hit.ingredient_id);
    else addFreeText();
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
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              return;
            }
            if (!options.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % options.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + options.length) % options.length);
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
          aria-label={`Add to ${label.toLowerCase()}`}
          disabled={options.length === 0 && !canAddFreeText}
          onClick={commit}
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
                    <span className="text-xs text-muted">unverified</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Previously the + went grey and nothing on screen said why. */}
      {noMatches && (
        <p className="text-xs text-muted">
          {alreadyAdded ? (
            <>“{typed}” is already on the list.</>
          ) : canAddFreeText ? (
            <>
              Nothing in the catalog matches “{typed}”.{' '}
              <button
                type="button"
                onClick={addFreeText}
                className="cursor-pointer text-brand underline"
              >
                Add it anyway
              </button>{' '}
              — the model will fix the spelling.
            </>
          ) : (
            <>Nothing in the catalog matches “{typed}”. Only known ingredients can be searched.</>
          )}
        </p>
      )}

      {(value.length > 0 || names.length > 0) && (
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

          {/* Dashed: in the sidebar but not in the catalog, and not yet spelled
              the way the catalog will end up spelling it. */}
          {names.map((name) => (
            <RemovableChip
              key={`free-${name}`}
              provisional
              label={name}
              onRemove={() => onNamesChange?.(names.filter((n) => n !== name))}
            >
              {name}
            </RemovableChip>
          ))}
        </div>
      )}
    </div>
  );
}
