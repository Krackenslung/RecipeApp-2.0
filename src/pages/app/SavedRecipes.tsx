import { RecipeCard } from '@/components/recipe/RecipeCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/states';
import { useSavedIds, useSavedRecipes, useToggleSave } from '@/queries/useSaved';

export default function SavedRecipes() {
  const { data: recipes, isLoading, isError, refetch } = useSavedRecipes();
  const { data: savedIds } = useSavedIds();
  const toggleSave = useToggleSave();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold text-ink">Guardadas</h1>
        <p className="mt-1 text-sm text-body">
          {recipes ? `${recipes.length} ${recipes.length === 1 ? 'receta' : 'recetas'}` : '…'}
        </p>
      </header>

      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !recipes?.length ? (
        <EmptyState
          title="Nada guardado todavía"
          message="El marcador en cada receta la manda aquí."
          action={<ButtonLink to="/">Explorar recetas</ButtonLink>}
        />
      ) : (
        <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <RecipeCard
              key={r.recipe_id}
              recipe={r}
              saved={savedIds?.includes(r.recipe_id)}
              onToggleSave={() =>
                toggleSave.mutate({
                  recipeId: r.recipe_id,
                  saved: Boolean(savedIds?.includes(r.recipe_id)),
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
