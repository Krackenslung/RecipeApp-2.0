import { Link, useParams } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
import { useCollection, useRemoveFromCollection } from '@/queries/useCollections';
import { useAuth } from '@/context/AuthProvider';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/Button';

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useCollection(id);
  const { user } = useAuth();
  const remove = useRemoveFromCollection();

  if (isLoading) return <SkeletonGrid />;

  if (isError) {
    const notFound = error instanceof Error && error.message === 'NOT_FOUND';
    return notFound ? (
      <EmptyState
        title="Esta colección no existe"
        message="O es privada y no es tuya."
        action={
          <Link to="/" className="text-sm text-guajillo underline">
            Volver a explorar
          </Link>
        }
      />
    ) : (
      <ErrorState onRetry={() => void refetch()} />
    );
  }

  if (!data) return null;
  const { collection, recipes } = data;
  const isOwner = user?.id === collection.user_id;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-black tracking-tight text-comal">
            {collection.name}
          </h1>
          {!collection.is_public && (
            <Lock size={16} className="text-ceniza" aria-label="Privada" />
          )}
        </div>
        {collection.description && (
          <p className="max-w-2xl text-sm text-ceniza">{collection.description}</p>
        )}
        <p className="font-mono text-xs text-ceniza">
          {recipes.length} {recipes.length === 1 ? 'receta' : 'recetas'}
        </p>
      </header>

      {recipes.length === 0 ? (
        <EmptyState
          title="Colección vacía"
          message="Desde cualquier receta puedes agregarla aquí."
          action={<ButtonLink to="/">Explorar recetas</ButtonLink>}
        />
      ) : (
        <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <div key={r.recipe_id} className="relative">
              <RecipeCard recipe={r} />
              {isOwner && (
                <button
                  type="button"
                  aria-label={`Quitar ${r.title} de la colección`}
                  onClick={() =>
                    remove.mutate({ collectionId: collection.collection_id, recipeId: r.recipe_id })
                  }
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center border border-ceniza/30 bg-cal text-ceniza transition-colors hover:border-guajillo hover:text-guajillo"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
