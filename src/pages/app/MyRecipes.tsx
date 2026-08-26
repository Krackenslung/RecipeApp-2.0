import { useEffect, useRef } from 'react';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/states';
import { flattenPages, useRecipeSearch } from '@/queries/useRecipeSearch';
import { useMyProfile } from '@/queries/useProfile';
import { useAuth } from '@/context/AuthProvider';
import { EMPTY_FILTERS } from '@/utils/filterArgs';

/**
 * Own recipes, drafts included. p_author_id is not part of the sidebar — it is
 * set by the screen, and RLS is what lets a draft come back at all.
 */
export default function MyRecipes() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const query = useRecipeSearch(EMPTY_FILTERS, user?.id);
  const recipes = flattenPages(query.data?.pages);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const drafts = recipes.filter((r) => r.status !== 'published' || r.visibility !== 'public');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-comal">
            {profile?.display_name ?? profile?.username ?? 'Mis recetas'}
          </h1>
          <p className="mt-1 text-sm text-ceniza">
            {recipes.length} {recipes.length === 1 ? 'receta' : 'recetas'}
            {drafts.length > 0 && ` · ${drafts.length} en borrador`}
          </p>
        </div>
        <ButtonLink to="/generate" variant="primary" size="sm">
          Generar una
        </ButtonLink>
      </header>

      {query.isLoading ? (
        <SkeletonGrid />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : recipes.length === 0 ? (
        <EmptyState
          title="Todavía no tienes recetas"
          message="Genera la primera y aparecerá aquí como borrador."
          action={
            <ButtonLink to="/generate" variant="primary">
              Generar una receta
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recipes.map((r) => (
              <RecipeCard key={r.recipe_id} recipe={r} />
            ))}
          </div>
          <div ref={sentinel} className="h-12" aria-hidden />
          {query.isFetchingNextPage && <SkeletonGrid count={3} />}
        </>
      )}
    </div>
  );
}
