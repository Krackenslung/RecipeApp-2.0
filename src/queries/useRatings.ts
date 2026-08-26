import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { socialDb, unwrap, unwrapMaybe } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type { RecipeDetail } from './useRecipe';

/** The signed-in user's own vote. (user_id, recipe_id) is the PK, so it's one row or none. */
export function useMyRating(recipeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rating', 'mine', recipeId, user?.id ?? null],
    enabled: Boolean(recipeId && user),
    queryFn: async (): Promise<number | null> => {
      const row = unwrapMaybe(
        await socialDb
          .from('ratings')
          .select('rating')
          .eq('recipe_id', recipeId!)
          .eq('user_id', user!.id)
          .maybeSingle(),
      );
      return row?.rating ?? null;
    },
  });
}

type Ctx = { previousMine: number | null | undefined; previousDetail: RecipeDetail | undefined };

/**
 * Optimistic, because the user is watching the average move. The authoritative
 * aggregate lives in recipe.recipes and is written by a trigger, so the real
 * value only arrives on refetch — roll back and invalidate on error.
 */
export function useRate(recipeId: string, slug: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const mineKey = ['rating', 'mine', recipeId, user?.id ?? null];
  const detailKey = ['recipe', 'detail', slug];

  return useMutation({
    mutationFn: async (rating: number) => {
      // user_id comes from the token via `default auth.uid()`, never the body.
      unwrap(
        await socialDb
          .from('ratings')
          .upsert({ recipe_id: recipeId, rating }, { onConflict: 'user_id,recipe_id' })
          .select('rating')
          .single(),
      );
    },
    onMutate: async (rating): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: mineKey });
      await qc.cancelQueries({ queryKey: detailKey });
      const previousMine = qc.getQueryData<number | null>(mineKey);
      const previousDetail = qc.getQueryData<RecipeDetail>(detailKey);

      qc.setQueryData(mineKey, rating);
      if (previousDetail) {
        const isNew = previousMine == null;
        const count = previousDetail.rating_count + (isNew ? 1 : 0);
        const prevSum = (previousDetail.rating_avg ?? 0) * previousDetail.rating_count;
        const sum = prevSum - (previousMine ?? 0) + rating;
        qc.setQueryData<RecipeDetail>(detailKey, {
          ...previousDetail,
          rating_count: count,
          rating_avg: count ? Number((sum / count).toFixed(2)) : null,
        });
      }
      return { previousMine, previousDetail };
    },
    onError: (_err, _rating, ctx) => {
      if (ctx?.previousMine !== undefined) qc.setQueryData(mineKey, ctx.previousMine);
      if (ctx?.previousDetail) qc.setQueryData(detailKey, ctx.previousDetail);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: mineKey });
      qc.invalidateQueries({ queryKey: detailKey });
    },
  });
}

export function useUnrate(recipeId: string, slug: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const mineKey = ['rating', 'mine', recipeId, user?.id ?? null];
  const detailKey = ['recipe', 'detail', slug];

  return useMutation({
    mutationFn: async () => {
      unwrap(
        await socialDb
          .from('ratings')
          .delete()
          .eq('recipe_id', recipeId)
          .eq('user_id', user!.id)
          .select('recipe_id'),
      );
    },
    onMutate: async (): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: mineKey });
      const previousMine = qc.getQueryData<number | null>(mineKey);
      const previousDetail = qc.getQueryData<RecipeDetail>(detailKey);
      qc.setQueryData(mineKey, null);
      return { previousMine, previousDetail };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previousMine !== undefined) qc.setQueryData(mineKey, ctx.previousMine);
      if (ctx?.previousDetail) qc.setQueryData(detailKey, ctx.previousDetail);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: mineKey });
      qc.invalidateQueries({ queryKey: detailKey });
    },
  });
}
