import { useMemo } from 'react';
import type { RecipeIngredient } from '@/queries/useRecipe';
import { useUnitMap } from '@/queries/useCatalog';
import { useIngredientNames } from '@/queries/useIngredientSearch';
import { TickingNumber } from './TickingNumber';

type Props = {
  ingredients: RecipeIngredient[];
  /** The recipe as written. */
  baseServings: number;
  /** What the user asked for. Quantities scale by the ratio between the two. */
  servings: number;
};

/**
 * The signature. Ingredients as a two-column ledger: quantity in mono,
 * right-aligned, against a hairline rule leading to the name. This is the one
 * place to spend visual boldness — everything else on the page stays quiet.
 */
export function IngredientLedger({ ingredients, baseServings, servings }: Props) {
  const units = useUnitMap();
  const factor = baseServings > 0 ? servings / baseServings : 1;

  // raw_text is always kept and usually reads "2 tazas de harina" — the quantity
  // is already its own column here, so prefer the catalogued name when there is
  // one and fall back to raw_text when Gemini returned something uncatalogued.
  const ids = useMemo(
    () => [...new Set(ingredients.map((i) => i.ingredient_id).filter((id): id is number => id != null))],
    [ingredients],
  );
  const { data: named } = useIngredientNames(ids);
  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const i of named ?? []) map.set(i.ingredient_id, i.name);
    return map;
  }, [named]);

  const groups = useMemo(() => {
    const map = new Map<string, RecipeIngredient[]>();
    for (const ing of ingredients) {
      const key = ing.group_label ?? '';
      const list = map.get(key);
      if (list) list.push(ing);
      else map.set(key, [ing]);
    }
    return [...map.entries()];
  }, [ingredients]);

  if (!ingredients.length) {
    return <p className="text-sm text-body">This recipe has no ingredients yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([label, items]) => (
        <section key={label || 'default'} className="flex flex-col gap-1">
          {label && (
            <h3 className="mb-1.5 text-sm font-semibold uppercase text-brand">{label}</h3>
          )}

          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {items.map((ing) => {
              const qty = ing.quantity != null ? ing.quantity * factor : null;
              const unit = ing.unit_id != null ? units.get(ing.unit_id) : null;

              return (
                <li
                  key={ing.recipe_ingredient_id}
                  className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3"
                >
                  <span className="text-right font-mono text-sm text-ink">
                    <TickingNumber value={qty} />
                    {unit && <span className="ml-1 text-muted">{unit}</span>}
                  </span>

                  {/* v1's red bullet, kept as a pseudo-element so it stays out
                      of the accessibility tree. */}
                  <span className="flex items-baseline before:mr-2 before:text-brand before:content-['•']">
                    <span className="text-sm text-body">
                      {(ing.ingredient_id != null && nameById.get(ing.ingredient_id)) ||
                        ing.raw_text}
                      {ing.preparation && <span className="text-muted">, {ing.preparation}</span>}
                      {ing.is_optional && (
                        <span className="ml-1.5 text-xs text-muted">(optional)</span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
