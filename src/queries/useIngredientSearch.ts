import { useQuery } from '@tanstack/react-query';
import { catalogDb, unwrap } from '@/lib/supabase';

export type IngredientHit = {
  ingredient_id: number;
  name: string;
  slug: string;
  is_verified: boolean;
};

/**
 * Autocomplete for the two ingredient fields. The component stores the
 * ingredient_id it gets back; the label is display only. Sending a name to the
 * RPC silently matches nothing.
 */
export function useIngredientSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ['catalog', 'ingredients', 'search', q],
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<IngredientHit[]> =>
      unwrap(
        await catalogDb
          .from('ingredients')
          .select('ingredient_id, name, slug, is_verified')
          .ilike('name', `%${q}%`)
          .order('is_verified', { ascending: false })
          .order('name')
          .range(0, 9),
      ),
  });
}

/**
 * Resolve ids back to names — the sidebar restores from a URL or from saved
 * preferences and only has ids to work with.
 */
export function useIngredientNames(ids: number[]) {
  const key = [...ids].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['catalog', 'ingredients', 'byId', key],
    enabled: key.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<IngredientHit[]> =>
      unwrap(
        await catalogDb
          .from('ingredients')
          .select('ingredient_id, name, slug, is_verified')
          .in('ingredient_id', key),
      ),
  });
}
