/**
 * The filter -> RPC mapping. The most error-prone code in the frontend, which
 * is why it lives alone in a module with its own tests.
 *
 * Rules encoded here:
 *  - IDs, never names. A name silently matches nothing.
 *  - An empty array means "no constraint" — omit the key, never send null.
 *  - null is the no-constraint value for scalars. 0 is a real constraint.
 *  - Send only what the user set; the function fills in the rest.
 */

export type SortKey = 'recent' | 'rating' | 'quick' | 'cheap' | 'popular';

export type RecipeFilters = {
  includeIngredients: number[]; // catalog.ingredients.ingredient_id
  excludeIngredients: number[];
  cuisines: number[];
  diets: number[];
  mealTypes: number[];
  excludeAllergens: number[];
  equipment: number[];
  maxMinutes: number | null;
  maxCost: number | null;
  costPerServing: boolean;
  maxCalories: number | null;
  maxDifficulty: 1 | 2 | 3 | null;
  minServings: number | null;
  maxServings: number | null;
  minRating: number | null;
  search: string;
  sort: SortKey;
};

export const PAGE_SIZE = 20;

export const EMPTY_FILTERS: RecipeFilters = {
  includeIngredients: [],
  excludeIngredients: [],
  cuisines: [],
  diets: [],
  mealTypes: [],
  excludeAllergens: [],
  equipment: [],
  maxMinutes: null,
  maxCost: null,
  costPerServing: false,
  maxCalories: null,
  maxDifficulty: null,
  minServings: null,
  maxServings: null,
  minRating: null,
  search: '',
  sort: 'recent',
};

export function toRpcArgs(
  f: RecipeFilters,
  page = 0,
  authorId?: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = { p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE };
  if (f.includeIngredients.length) args.p_include_ingredients = f.includeIngredients;
  if (f.excludeIngredients.length) args.p_exclude_ingredients = f.excludeIngredients;
  if (f.cuisines.length) args.p_cuisines = f.cuisines;
  if (f.diets.length) args.p_diets = f.diets;
  if (f.mealTypes.length) args.p_meal_types = f.mealTypes;
  if (f.excludeAllergens.length) args.p_exclude_allergens = f.excludeAllergens;
  if (f.equipment.length) args.p_equipment = f.equipment;
  if (f.maxMinutes != null) args.p_max_minutes = f.maxMinutes;
  if (f.maxCalories != null) args.p_max_calories = f.maxCalories;
  if (f.maxDifficulty != null) args.p_max_difficulty = f.maxDifficulty;
  if (f.minServings != null) args.p_min_servings = f.minServings;
  if (f.maxServings != null) args.p_max_servings = f.maxServings;
  if (f.minRating != null) args.p_min_rating = f.minRating;
  if (f.maxCost != null) {
    args.p_max_cost = f.maxCost;
    args.p_cost_per_serving = f.costPerServing;
  }
  if (f.search.trim()) args.p_search = f.search.trim();
  if (f.sort !== 'recent') args.p_sort = f.sort;
  if (authorId) args.p_author_id = authorId;
  return args;
}

/**
 * How the RPC combines each group. Surfaced in the UI because a user who picks
 * "vegan" and "keto" gets zero results and will otherwise read that as a bug.
 */
export const COMBINATOR: Record<string, 'ANY' | 'ALL' | 'NONE'> = {
  cuisines: 'ANY',
  mealTypes: 'ANY',
  diets: 'ALL',
  equipment: 'ALL',
  includeIngredients: 'ALL',
  excludeIngredients: 'NONE',
  excludeAllergens: 'NONE',
};

/** Number of dimensions the user has actually constrained. Shown next to the result count. */
export function countActive(f: RecipeFilters): number {
  let n = 0;
  n += f.includeIngredients.length ? 1 : 0;
  n += f.excludeIngredients.length ? 1 : 0;
  n += f.cuisines.length ? 1 : 0;
  n += f.diets.length ? 1 : 0;
  n += f.mealTypes.length ? 1 : 0;
  n += f.excludeAllergens.length ? 1 : 0;
  n += f.equipment.length ? 1 : 0;
  n += f.maxMinutes != null ? 1 : 0;
  n += f.maxCost != null ? 1 : 0;
  n += f.maxCalories != null ? 1 : 0;
  n += f.maxDifficulty != null ? 1 : 0;
  n += f.minServings != null ? 1 : 0;
  n += f.maxServings != null ? 1 : 0;
  n += f.minRating != null ? 1 : 0;
  n += f.search.trim() ? 1 : 0;
  return n;
}

export function isEmptyFilters(f: RecipeFilters): boolean {
  return countActive(f) === 0;
}

export type NarrowestConstraint = {
  key: keyof RecipeFilters;
  label: string;
  /** Copy for the empty state: "No recipes with all 4 ingredients. Remove one?" */
  message: string;
};

/**
 * Which constraint is most likely to be the one returning nothing. Drives the
 * empty state, which offers to clear exactly that one — "No results" is useless.
 */
export function narrowestConstraint(f: RecipeFilters): NarrowestConstraint | null {
  if (f.includeIngredients.length > 1) {
    return {
      key: 'includeIngredients',
      label: 'ingredientes',
      message: `Ninguna receta lleva los ${f.includeIngredients.length} ingredientes. ¿Quitas uno?`,
    };
  }
  if (f.diets.length > 1) {
    return {
      key: 'diets',
      label: 'dietas',
      message: `Ninguna receta cumple las ${f.diets.length} dietas a la vez. ¿Quitas una?`,
    };
  }
  if (f.equipment.length > 1) {
    return {
      key: 'equipment',
      label: 'equipo',
      message: `Ninguna receta usa los ${f.equipment.length} utensilios. ¿Quitas uno?`,
    };
  }
  if (f.maxMinutes != null) {
    return {
      key: 'maxMinutes',
      label: 'tiempo',
      message: `Ninguna receta se hace en ${f.maxMinutes} min o menos. ¿Subes el límite?`,
    };
  }
  if (f.maxCost != null) {
    return {
      key: 'maxCost',
      label: 'costo',
      message: `Ninguna receta cuesta ${f.maxCost} o menos. ¿Subes el límite?`,
    };
  }
  if (f.maxCalories != null) {
    return {
      key: 'maxCalories',
      label: 'calorías',
      message: `Ninguna receta baja de ${f.maxCalories} kcal. ¿Subes el límite?`,
    };
  }
  if (f.minRating != null) {
    return {
      key: 'minRating',
      label: 'calificación',
      message: `Ninguna receta llega a ${f.minRating} estrellas. ¿Bajas el mínimo?`,
    };
  }
  if (f.search.trim()) {
    return {
      key: 'search',
      label: 'búsqueda',
      message: `Nada coincide con «${f.search.trim()}». ¿Borras la búsqueda?`,
    };
  }
  if (f.includeIngredients.length === 1) {
    return {
      key: 'includeIngredients',
      label: 'ingredientes',
      message: 'Ninguna receta lleva ese ingrediente. ¿Lo quitas?',
    };
  }
  if (f.cuisines.length) {
    return { key: 'cuisines', label: 'cocina', message: 'Nada en esa cocina todavía. ¿La quitas?' };
  }
  return null;
}

/** Reset one key back to its EMPTY_FILTERS value. Used by the empty state's button. */
export function clearConstraint(f: RecipeFilters, key: keyof RecipeFilters): RecipeFilters {
  return { ...f, [key]: EMPTY_FILTERS[key] };
}
