import { Search, X } from 'lucide-react';
import { useCatalog } from '@/queries/useCatalog';
import { Button } from '@/components/ui/Button';
import { Checkbox, FIELD_CONTROL, FIELD_LABEL } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/states';
import { TagGroup } from '@/components/filters/TagGroup';
import { IngredientAutocomplete } from '@/components/filters/IngredientAutocomplete';
import { RangeField, ServingsRange } from '@/components/filters/RangeField';
import { countActive, EMPTY_FILTERS, type RecipeFilters } from '@/utils/filterArgs';
import { cx } from '@/utils/cx';

/**
 * v1 showed cost as three buttons, not a slider; the RPC still wants a number,
 * so each level is a cap. Tuned for MXN — move them here, not at the call site.
 */
const COST_LEVELS: { label: string; cap: number }[] = [
  { label: '$', cap: 100 },
  { label: '$$', cap: 250 },
  { label: '$$$', cap: 600 },
];

const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard'] as const;

type Props = {
  /** The sidebar edits `draft`. Only `applied` ever reaches the query key. */
  draft: RecipeFilters;
  onDraftChange: (next: RecipeFilters) => void;
  onApply: () => void;
  onReset: () => void;
  /** True while draft and applied disagree — the Search button has work to do. */
  dirty: boolean;
  searching?: boolean;
  /** Ids seeded from the user's saved preferences, shown as such rather than hidden. */
  seededDiets?: number[];
  seededAllergens?: number[];
  /**
   * Let the user add ingredients the catalog does not know. On for /generate,
   * where the model reads them; off for the feed, where search_recipes() joins
   * on ingredient_id and a typed name could not narrow anything.
   */
  allowFreeText?: boolean;
};

export function FilterSidebar({
  draft,
  onDraftChange,
  onApply,
  onReset,
  dirty,
  searching = false,
  seededDiets = [],
  seededAllergens = [],
  allowFreeText = false,
}: Props) {
  const { cuisines, diets, allergens, mealTypes, equipment, isLoading } = useCatalog();
  const set = <K extends keyof RecipeFilters>(key: K, value: RecipeFilters[K]) =>
    onDraftChange({ ...draft, [key]: value });

  const active = countActive(draft);
  const seeded =
    seededDiets.some((d) => draft.diets.includes(d)) ||
    seededAllergens.some((a) => draft.excludeAllergens.includes(a));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Filters</h2>
        {active > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-body transition-colors hover:text-ink"
          >
            <X size={12} aria-hidden />
            Clear {active}
          </button>
        )}
      </div>

      {seeded && (
        <p className="rounded-card border border-success px-3 py-2 text-xs text-success">
          We pre-filled diets and allergens from your preferences. You can remove them.
        </p>
      )}

      <div>
        <label htmlFor="filter-search" className={FIELD_LABEL}>
          Search
        </label>
        <div className="relative">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            id="filter-search"
            type="search"
            value={draft.search}
            placeholder="pozole, tinga…"
            onChange={(e) => set('search', e.target.value)}
            className={cx(FIELD_CONTROL, 'pl-8')}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-body">
          <Spinner />
          Loading catalog…
        </div>
      ) : (
        <>
          <IngredientAutocomplete
            label="With these ingredients"
            value={draft.includeIngredients}
            onChange={(v) => set('includeIngredients', v)}
            names={draft.includeIngredientNames}
            onNamesChange={(v) => set('includeIngredientNames', v)}
            allowFreeText={allowFreeText}
          />

          <IngredientAutocomplete
            label="Without these ingredients"
            tone="accent"
            placeholder="Ingredient to exclude"
            value={draft.excludeIngredients}
            onChange={(v) => set('excludeIngredients', v)}
            names={draft.excludeIngredientNames}
            onNamesChange={(v) => set('excludeIngredientNames', v)}
            allowFreeText={allowFreeText}
          />

          <TagGroup
            label="Cuisine"
            combinator="ANY"
            items={cuisines.map((c) => ({ id: c.cuisine_id, name: c.name }))}
            value={draft.cuisines}
            onChange={(v) => set('cuisines', v)}
          />

          <TagGroup
            label="Meal type"
            combinator="ANY"
            items={mealTypes.map((m) => ({ id: m.meal_type_id, name: m.name }))}
            value={draft.mealTypes}
            onChange={(v) => set('mealTypes', v)}
          />

          <TagGroup
            label="Diet"
            tone="diet"
            combinator="ALL"
            items={diets.map((d) => ({ id: d.diet_id, name: d.name }))}
            value={draft.diets}
            onChange={(v) => set('diets', v)}
            note={
              draft.diets.length > 1
                ? 'The recipe has to satisfy every diet at once.'
                : undefined
            }
          />

          <TagGroup
            label="Without allergens"
            tone="accent"
            combinator="NONE"
            items={allergens.map((a) => ({ id: a.allergen_id, name: a.name }))}
            value={draft.excludeAllergens}
            onChange={(v) => set('excludeAllergens', v)}
            note="Derived from the ingredients, optional ones included."
          />

          <TagGroup
            label="Equipment"
            combinator="ALL"
            items={equipment.map((e) => ({ id: e.equipment_id, name: e.name }))}
            value={draft.equipment}
            onChange={(v) => set('equipment', v)}
          />
        </>
      )}

      <RangeField
        label="Total time"
        value={draft.maxMinutes}
        onChange={(v) => set('maxMinutes', v)}
        min={10}
        max={240}
        step={5}
        format={(n) => `${n} min`}
      />

      <RangeField
        label="Calories per serving"
        value={draft.maxCalories}
        onChange={(v) => set('maxCalories', v)}
        min={100}
        max={1500}
        step={50}
        format={(n) => `${n} kcal`}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={FIELD_LABEL}>Maximum cost</legend>
        <div className="flex gap-1.5">
          {COST_LEVELS.map(({ label, cap }) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={draft.maxCost === cap ? 'success' : 'secondary'}
              aria-pressed={draft.maxCost === cap}
              onClick={() => set('maxCost', draft.maxCost === cap ? null : cap)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Checkbox
          label={<span className="text-xs text-muted">Per serving, not per recipe</span>}
          checked={draft.costPerServing}
          disabled={draft.maxCost == null}
          onChange={(v) => set('costPerServing', v)}
        />
      </fieldset>

      <ServingsRange
        min={draft.minServings}
        max={draft.maxServings}
        onChange={({ min, max }) => onDraftChange({ ...draft, minServings: min, maxServings: max })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={FIELD_LABEL}>Maximum difficulty</legend>
        <div className="flex gap-1.5">
          {([1, 2, 3] as const).map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={draft.maxDifficulty === d ? 'primary' : 'secondary'}
              aria-pressed={draft.maxDifficulty === d}
              onClick={() => set('maxDifficulty', draft.maxDifficulty === d ? null : d)}
            >
              {DIFFICULTY_LABELS[d - 1]}
            </Button>
          ))}
        </div>
      </fieldset>

      <RangeField
        label="Minimum rating"
        value={draft.minRating}
        onChange={(v) => set('minRating', v)}
        min={1}
        max={5}
        step={0.5}
        format={(n) => `${n} ★`}
      />

      <div className="sticky bottom-0 flex flex-col gap-2 bg-surface pb-1 pt-2">
        <Button type="submit" variant="primary" loading={searching} disabled={!dirty && !searching}>
          {dirty ? 'Search' : 'Results are current'}
        </Button>
        {draft !== EMPTY_FILTERS && active > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Clear filters
          </Button>
        )}
      </div>
    </form>
  );
}
