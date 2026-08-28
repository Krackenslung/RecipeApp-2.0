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
  /**
   * Free text the user typed that matched nothing in the catalog. Kept apart
   * from the ids on purpose: these cannot be sent to search_recipes(), which
   * joins on ingredient_id and has no parameter for a name. They exist only to
   * reach api/generate.ts, which passes them to the model for spelling
   * correction — the 1.0 behaviour, where anything you could type was a valid
   * ingredient.
   */
  includeIngredientNames: string[];
  excludeIngredientNames: string[];
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
  includeIngredientNames: [],
  excludeIngredientNames: [],
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

  // includeIngredientNames / excludeIngredientNames are deliberately absent.
  // search_recipes() takes integer[] and joins on ingredient_id; there is no
  // parameter that accepts a name, and PostgREST resolves RPCs by argument
  // name, so inventing one would fail the call outright rather than be ignored.
  // Free text is for generation only.
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
  // Counted even though they never reach the RPC: the user set them, and the
  // count is a statement about the sidebar, not about the query.
  n += f.includeIngredients.length || f.includeIngredientNames.length ? 1 : 0;
  n += f.excludeIngredients.length || f.excludeIngredientNames.length ? 1 : 0;
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
      label: 'ingredients',
      message: `No recipe has all ${f.includeIngredients.length} ingredients. Drop one?`,
    };
  }
  if (f.diets.length > 1) {
    return {
      key: 'diets',
      label: 'diets',
      message: `No recipe satisfies all ${f.diets.length} diets at once. Drop one?`,
    };
  }
  if (f.equipment.length > 1) {
    return {
      key: 'equipment',
      label: 'equipment',
      message: `No recipe uses all ${f.equipment.length} pieces of equipment. Drop one?`,
    };
  }
  if (f.maxMinutes != null) {
    return {
      key: 'maxMinutes',
      label: 'time',
      message: `No recipe is done in ${f.maxMinutes} min or less. Raise the limit?`,
    };
  }
  if (f.maxCost != null) {
    return {
      key: 'maxCost',
      label: 'cost',
      message: `No recipe costs ${f.maxCost} or less. Raise the limit?`,
    };
  }
  if (f.maxCalories != null) {
    return {
      key: 'maxCalories',
      label: 'calories',
      message: `No recipe comes under ${f.maxCalories} kcal. Raise the limit?`,
    };
  }
  if (f.minRating != null) {
    return {
      key: 'minRating',
      label: 'rating',
      message: `No recipe reaches ${f.minRating} stars. Lower the minimum?`,
    };
  }
  if (f.search.trim()) {
    return {
      key: 'search',
      label: 'search',
      message: `Nothing matches “${f.search.trim()}”. Clear the search?`,
    };
  }
  if (f.includeIngredients.length === 1) {
    return {
      key: 'includeIngredients',
      label: 'ingredients',
      message: 'No recipe has that ingredient. Drop it?',
    };
  }
  if (f.cuisines.length) {
    return { key: 'cuisines', label: 'cuisine', message: 'Nothing in that cuisine yet. Drop it?' };
  }
  return null;
}

/** Reset one key back to its EMPTY_FILTERS value. Used by the empty state's button. */
export function clearConstraint(f: RecipeFilters, key: keyof RecipeFilters): RecipeFilters {
  return { ...f, [key]: EMPTY_FILTERS[key] };
}
