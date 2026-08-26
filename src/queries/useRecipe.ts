import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recipeDb, unwrap, unwrapMaybe } from '@/lib/supabase';
import type { Database } from '@/types/database';

type R = Database['recipe']['Tables'];
export type Recipe = R['recipes']['Row'];
export type RecipeIngredient = R['recipe_ingredients']['Row'];
export type RecipeStep = R['recipe_steps']['Row'];
export type RecipeNutrition = R['recipe_nutrition']['Row'];

export type RecipeDetail = Recipe & {
  recipe_ingredients: RecipeIngredient[];
  recipe_steps: RecipeStep[];
  recipe_nutrition: RecipeNutrition | null;
  recipe_images: R['recipe_images']['Row'][];
  recipe_cuisines: { cuisine_id: number }[];
  recipe_diets: { diet_id: number }[];
  recipe_meal_types: { meal_type_id: number }[];
  recipe_equipment: { equipment_id: number }[];
};

/** One round-trip for the whole tree — embedded resources, not N+1. */
const DETAIL_SELECT = `
  *,
  recipe_ingredients(*),
  recipe_steps(*),
  recipe_nutrition(*),
  recipe_images(*),
  recipe_cuisines(cuisine_id),
  recipe_diets(diet_id),
  recipe_meal_types(meal_type_id),
  recipe_equipment(equipment_id)
`;

export function useRecipe(slug: string | undefined) {
  return useQuery({
    queryKey: ['recipe', 'detail', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<RecipeDetail> => {
      const row = unwrapMaybe(
        await recipeDb
          .from('recipes')
          .select(DETAIL_SELECT)
          .eq('slug', slug!)
          .is('deleted_at', null)
          .maybeSingle(),
      );
      if (!row) throw new Error('NOT_FOUND');

      const r = row as unknown as RecipeDetail & { recipe_nutrition: RecipeNutrition[] | RecipeNutrition | null };
      return {
        ...r,
        // A 1:1 embed still arrives as an array from PostgREST.
        recipe_nutrition: Array.isArray(r.recipe_nutrition)
          ? (r.recipe_nutrition[0] ?? null)
          : r.recipe_nutrition,
        recipe_ingredients: [...(r.recipe_ingredients ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
        recipe_steps: [...(r.recipe_steps ?? [])].sort((a, b) => a.step_number - b.step_number),
      };
    },
  });
}

// view_count is "incremented by the app" per schema.md, but RLS only allows a
// user to update their own recipes — so it needs a security-definer RPC that
// does not exist yet. Deliberately not called from here until it does.

/** The model proposes, the user publishes. Draft/private -> published/public. */
export function usePublishRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string) =>
      unwrap(
        await recipeDb
          .from('recipes')
          .update({
            status: 'published',
            visibility: 'public',
            published_at: new Date().toISOString(),
          })
          .eq('recipe_id', recipeId)
          .select('recipe_id, slug, status, visibility')
          .single(),
      ),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['recipe', 'detail', row.slug] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      patch,
    }: {
      recipeId: string;
      patch: R['recipes']['Update'];
    }) =>
      unwrap(
        await recipeDb
          .from('recipes')
          .update(patch)
          .eq('recipe_id', recipeId)
          .select('recipe_id, slug')
          .single(),
      ),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['recipe', 'detail', row.slug] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

/** Soft delete — content tables keep the row so comments and saves survive. */
export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string) =>
      unwrap(
        await recipeDb
          .from('recipes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('recipe_id', recipeId)
          .select('recipe_id')
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}
