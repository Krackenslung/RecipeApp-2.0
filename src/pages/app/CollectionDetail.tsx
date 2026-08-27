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
        title="This collection doesn’t exist"
        message="Or it’s private and not yours."
        action={
          <Link to="/" className="text-sm text-brand underline">
            Back to browsing
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
          <h1 className="text-3xl font-semibold text-ink">
            {collection.name}
          </h1>
          {!collection.is_public && (
            <Lock size={16} className="text-body" aria-label="Private" />
          )}
        </div>
        {collection.description && (
          <p className="max-w-2xl text-sm text-body">{collection.description}</p>
        )}
        <p className="font-mono text-xs text-body">
          {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
        </p>
      </header>

      {recipes.length === 0 ? (
        <EmptyState
          title="Empty collection"
          message="You can add one here from any recipe."
          action={<ButtonLink to="/">Browse recipes</ButtonLink>}
        />
      ) : (
        <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <div key={r.recipe_id} className="relative">
              <RecipeCard recipe={r} />
              {isOwner && (
                <button
                  type="button"
                  aria-label={`Remove ${r.title} from the collection`}
                  onClick={() =>
                    remove.mutate({ collectionId: collection.collection_id, recipeId: r.recipe_id })
                  }
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-card border border-line-strong bg-surface text-body transition-colors hover:border-brand hover:text-brand"
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
