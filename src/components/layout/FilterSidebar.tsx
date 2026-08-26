import { Search, X } from 'lucide-react';
import { useCatalog } from '@/queries/useCatalog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/states';
import { TagGroup } from '@/components/filters/TagGroup';
import { IngredientAutocomplete } from '@/components/filters/IngredientAutocomplete';
import { CostField, RangeField, ServingsRange } from '@/components/filters/RangeField';
import { countActive, EMPTY_FILTERS, type RecipeFilters } from '@/utils/filterArgs';

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
        <h2 className="font-display text-lg font-black tracking-tight text-comal">Filtros</h2>
        {active > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-ceniza transition-colors hover:text-comal"
          >
            <X size={12} aria-hidden />
            Limpiar {active}
          </button>
        )}
      </div>

      {seeded && (
        <p className="border border-tomatillo/35 px-3 py-2 text-xs text-tomatillo">
          Pre-llenamos dietas y alérgenos con tus preferencias. Puedes quitarlos.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="filter-search"
          className="text-xs font-medium uppercase tracking-wide text-ceniza"
        >
          Buscar
        </label>
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ceniza"
          />
          <input
            id="filter-search"
            type="search"
            value={draft.search}
            placeholder="pozole, tinga…"
            onChange={(e) => set('search', e.target.value)}
            className="w-full border border-ceniza/35 bg-cal py-2 pl-8 pr-3 text-sm text-comal placeholder:text-ceniza/70 focus:border-comal focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-ceniza">
          <Spinner />
          Cargando catálogo…
        </div>
      ) : (
        <>
          <IngredientAutocomplete
            label="Con estos ingredientes"
            value={draft.includeIngredients}
            onChange={(v) => set('includeIngredients', v)}
          />

          <IngredientAutocomplete
            label="Sin estos ingredientes"
            tone="accent"
            placeholder="Ingrediente a excluir"
            value={draft.excludeIngredients}
            onChange={(v) => set('excludeIngredients', v)}
          />

          <TagGroup
            label="Cocina"
            combinator="ANY"
            items={cuisines.map((c) => ({ id: c.cuisine_id, name: c.name }))}
            value={draft.cuisines}
            onChange={(v) => set('cuisines', v)}
          />

          <TagGroup
            label="Tiempo de comida"
            combinator="ANY"
            items={mealTypes.map((m) => ({ id: m.meal_type_id, name: m.name }))}
            value={draft.mealTypes}
            onChange={(v) => set('mealTypes', v)}
          />

          <TagGroup
            label="Dieta"
            tone="diet"
            combinator="ALL"
            items={diets.map((d) => ({ id: d.diet_id, name: d.name }))}
            value={draft.diets}
            onChange={(v) => set('diets', v)}
            note={
              draft.diets.length > 1
                ? 'La receta tiene que cumplir las dietas al mismo tiempo.'
                : undefined
            }
          />

          <TagGroup
            label="Sin alérgenos"
            tone="accent"
            combinator="NONE"
            items={allergens.map((a) => ({ id: a.allergen_id, name: a.name }))}
            value={draft.excludeAllergens}
            onChange={(v) => set('excludeAllergens', v)}
            note="Se calcula desde los ingredientes, incluso los opcionales."
          />

          <TagGroup
            label="Equipo"
            combinator="ALL"
            items={equipment.map((e) => ({ id: e.equipment_id, name: e.name }))}
            value={draft.equipment}
            onChange={(v) => set('equipment', v)}
          />
        </>
      )}

      <RangeField
        label="Tiempo total"
        value={draft.maxMinutes}
        onChange={(v) => set('maxMinutes', v)}
        min={10}
        max={240}
        step={5}
        format={(n) => `${n} min`}
      />

      <RangeField
        label="Calorías por porción"
        value={draft.maxCalories}
        onChange={(v) => set('maxCalories', v)}
        min={100}
        max={1500}
        step={50}
        format={(n) => `${n} kcal`}
      />

      <CostField
        value={draft.maxCost}
        onChange={(v) => set('maxCost', v)}
        perServing={draft.costPerServing}
        onPerServingChange={(v) => set('costPerServing', v)}
      />

      <ServingsRange
        min={draft.minServings}
        max={draft.maxServings}
        onChange={({ min, max }) => onDraftChange({ ...draft, minServings: min, maxServings: max })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-ceniza">
          Dificultad máxima
        </legend>
        <div className="flex gap-1.5">
          {([1, 2, 3] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={draft.maxDifficulty === d}
              onClick={() => set('maxDifficulty', draft.maxDifficulty === d ? null : d)}
              className={
                draft.maxDifficulty === d
                  ? 'border border-comal bg-comal px-3 py-1 text-sm text-cal'
                  : 'border border-ceniza/30 px-3 py-1 text-sm text-ceniza transition-colors hover:border-comal hover:text-comal'
              }
            >
              {['Fácil', 'Media', 'Difícil'][d - 1]}
            </button>
          ))}
        </div>
      </fieldset>

      <RangeField
        label="Calificación mínima"
        value={draft.minRating}
        onChange={(v) => set('minRating', v)}
        min={1}
        max={5}
        step={0.5}
        format={(n) => `${n} ★`}
      />

      <div className="sticky bottom-4 flex flex-col gap-2 bg-masa pt-2">
        <Button type="submit" variant="primary" loading={searching} disabled={!dirty && !searching}>
          {dirty ? 'Buscar' : 'Resultados al día'}
        </Button>
        {draft !== EMPTY_FILTERS && active > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Limpiar filtros
          </Button>
        )}
      </div>
    </form>
  );
}
