import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recipeDb, socialDb, unwrap } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type { RecipeCard } from './useRecipeSearch';

/** The set of recipe ids this user has saved. One query drives every heart on the feed. */
export function useSavedIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['saved', 'ids', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(await socialDb.from('saved_recipes').select('recipe_id'));
      return rows.map((r) => r.recipe_id);
    },
  });
}

export function useIsSaved(recipeId: string | undefined): boolean {
  const { data } = useSavedIds();
  return Boolean(recipeId && data?.includes(recipeId));
}

/** The full saved list for /me/saved, joined to the card view. */
export function useSavedRecipes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['saved', 'list', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<RecipeCard[]> => {
      const rows = unwrap(
        await socialDb
          .from('saved_recipes')
          .select('recipe_id, saved_at, notes')
          .order('saved_at', { ascending: false })
          .range(0, 199),
      );
      if (!rows.length) return [];

      return unwrap(
        await recipeDb
          .from('vw_recipe_cards')
          .select('*')
          .in(
            'recipe_id',
            rows.map((r) => r.recipe_id),
          ),
      );
    },
  });
}

/**
 * Optimistic: save_count is a counter the user is watching. The trigger owns
 * the authoritative value, so on error we roll back and let the refetch win.
 */
export function useToggleSave() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const idsKey = ['saved', 'ids', user?.id ?? null];

  return useMutation({
    mutationFn: async ({ recipeId, saved }: { recipeId: string; saved: boolean }) => {
      if (saved) {
        unwrap(
          await socialDb
            .from('saved_recipes')
            .delete()
            .eq('recipe_id', recipeId)
            .eq('user_id', user!.id)
            .select('recipe_id'),
        );
      } else {
        unwrap(
          await socialDb
            .from('saved_recipes')
            .insert({ recipe_id: recipeId })
            .select('recipe_id')
            .single(),
        );
      }
    },
    onMutate: async ({ recipeId, saved }) => {
      await qc.cancelQueries({ queryKey: idsKey });
      const previous = qc.getQueryData<string[]>(idsKey) ?? [];
      qc.setQueryData<string[]>(
        idsKey,
        saved ? previous.filter((id) => id !== recipeId) : [...previous, recipeId],
      );
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(idsKey, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['saved'] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['recipe', 'detail'] });
    },
  });
}
