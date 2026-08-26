import { useInfiniteQuery } from '@tanstack/react-query';
import { recipeDb, unwrap } from '@/lib/supabase';
import { PAGE_SIZE, toRpcArgs, type RecipeFilters } from '@/utils/filterArgs';
import type { Database } from '@/types/database';

export type RecipeCard = Database['recipe']['Views']['vw_recipe_cards']['Row'];

export async function searchRecipes(
  filters: RecipeFilters,
  page: number,
  authorId?: string,
): Promise<RecipeCard[]> {
  const args = toRpcArgs(filters, page, authorId);
  return unwrap(await recipeDb.rpc('search_recipes', args as never));
}

/**
 * The feed. Infinite scroll, not a numbered pager — the RPC returns no total
 * count and count_recipes() caps at 50, so a page count would be a lie.
 *
 * `filters` here is always the *applied* set. If the sidebar draft ever reaches
 * this query key every keystroke refetches and the Search button is decorative.
 */
export function useRecipeSearch(filters: RecipeFilters, authorId?: string) {
  return useInfiniteQuery({
    queryKey: ['recipes', 'search', filters, authorId ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => searchRecipes(filters, pageParam, authorId),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
  });
}

/** Flattens the pages for rendering, since the grid doesn't care about page boundaries. */
export function flattenPages(pages: RecipeCard[][] | undefined): RecipeCard[] {
  return pages ? pages.flat() : [];
}
