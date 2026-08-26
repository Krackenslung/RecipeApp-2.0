import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recipeDb, socialDb, unwrap, unwrapMaybe } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type { Database } from '@/types/database';
import type { RecipeCard } from './useRecipeSearch';

export type Collection = Database['social']['Tables']['collections']['Row'];

export function useMyCollections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['collections', 'mine', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<Collection[]> =>
      unwrap(
        await socialDb
          .from('collections')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ),
  });
}

/** Public collections of another user. RLS decides what comes back. */
export function useUserCollections(userId: string | undefined) {
  return useQuery({
    queryKey: ['collections', 'byUser', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Collection[]> =>
      unwrap(
        await socialDb
          .from('collections')
          .select('*')
          .eq('user_id', userId!)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ),
  });
}

export function useCollection(collectionId: string | undefined) {
  return useQuery({
    queryKey: ['collection', 'detail', collectionId],
    enabled: Boolean(collectionId),
    queryFn: async () => {
      const collection = unwrapMaybe(
        await socialDb
          .from('collections')
          .select('*')
          .eq('collection_id', collectionId!)
          .is('deleted_at', null)
          .maybeSingle(),
      );
      if (!collection) throw new Error('NOT_FOUND');

      const members = unwrap(
        await socialDb
          .from('collection_recipes')
          .select('recipe_id, sort_order')
          .eq('collection_id', collectionId!)
          .order('sort_order'),
      );

      let recipes: RecipeCard[] = [];
      if (members.length) {
        const cards = unwrap(
          await recipeDb
            .from('vw_recipe_cards')
            .select('*')
            .in(
              'recipe_id',
              members.map((m) => m.recipe_id),
            ),
        );
        const order = new Map(members.map((m) => [m.recipe_id, m.sort_order]));
        recipes = cards.sort(
          (a, b) => (order.get(a.recipe_id) ?? 0) - (order.get(b.recipe_id) ?? 0),
        );
      }

      return { collection, recipes };
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; is_public?: boolean }) =>
      unwrap(await socialDb.from('collections').insert(input).select('*').single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collectionId,
      patch,
    }: {
      collectionId: string;
      patch: Database['social']['Tables']['collections']['Update'];
    }) =>
      unwrap(
        await socialDb
          .from('collections')
          .update(patch)
          .eq('collection_id', collectionId)
          .select('*')
          .single(),
      ),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['collection', 'detail', row.collection_id] });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (collectionId: string) =>
      unwrap(
        await socialDb
          .from('collections')
          .update({ deleted_at: new Date().toISOString() })
          .eq('collection_id', collectionId)
          .select('collection_id')
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });
}

export function useAddToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) =>
      unwrap(
        await socialDb
          .from('collection_recipes')
          .upsert(
            { collection_id: collectionId, recipe_id: recipeId },
            { onConflict: 'collection_id,recipe_id' },
          )
          .select('collection_id')
          .single(),
      ),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: ['collection', 'detail', vars.collectionId] }),
  });
}

export function useRemoveFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) =>
      unwrap(
        await socialDb
          .from('collection_recipes')
          .delete()
          .eq('collection_id', collectionId)
          .eq('recipe_id', recipeId)
          .select('recipe_id'),
      ),
    onSuccess: (_row, vars) =>
      qc.invalidateQueries({ queryKey: ['collection', 'detail', vars.collectionId] }),
  });
}
