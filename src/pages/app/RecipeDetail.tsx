import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bookmark, Clock, FolderPlus, Share2, Users } from 'lucide-react';
import { useRecipe, usePublishRecipe } from '@/queries/useRecipe';
import { useMyRating, useRate, useUnrate } from '@/queries/useRatings';
import { useIsSaved, useToggleSave } from '@/queries/useSaved';
import { useAddToCollection, useMyCollections } from '@/queries/useCollections';
import { useAuth } from '@/context/AuthProvider';
import { useDialog } from '@/hooks/useDialog';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { IngredientLedger } from '@/components/recipe/IngredientLedger';
import { ServingsStepper } from '@/components/recipe/ServingsStepper';
import { StepList } from '@/components/recipe/StepList';
import { RatingStars } from '@/components/recipe/RatingStars';
import { CommentThread } from '@/components/recipe/CommentThread';
import { formatCost, formatDifficulty, formatMinutes, formatRating } from '@/utils/format';

export default function RecipeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(slug);
  const { user } = useAuth();
  const { toast } = useToast();

  const [servings, setServings] = useState<number | null>(null);
  useEffect(() => {
    if (recipe) setServings(recipe.servings);
  }, [recipe]);

  const saved = useIsSaved(recipe?.recipe_id);
  const toggleSave = useToggleSave();
  const { data: myRating } = useMyRating(recipe?.recipe_id);
  const rate = useRate(recipe?.recipe_id ?? '', slug ?? '');
  const unrate = useUnrate(recipe?.recipe_id ?? '', slug ?? '');
  const publish = usePublishRecipe();

  const collectionDialog = useDialog();
  const { data: collections } = useMyCollections();
  const addToCollection = useAddToCollection();

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof Error && error.message === 'NOT_FOUND';
    return notFound ? (
      <EmptyState
        title="This recipe doesn’t exist"
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

  if (!recipe || servings == null) return null;

  const isAuthor = user?.id === recipe.author_id;
  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';
  const nutrition = recipe.recipe_nutrition;
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;

  return (
    <article className="flex flex-col gap-10">
      {isDraft && isAuthor && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand bg-surface px-4 py-3">
          <p className="text-sm text-ink">
            This recipe is a private draft. The model proposes, you publish.
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={publish.isPending}
            onClick={() =>
              publish.mutate(recipe.recipe_id, {
                onSuccess: () => toast('Published', 'success'),
                onError: () => toast('We couldn’t publish it. Try again.', 'error'),
              })
            }
          >
            Publish
          </Button>
        </div>
      )}

      <header className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ink">
            {recipe.title}
          </h1>

          {recipe.summary && <p className="max-w-2xl text-base text-body">{recipe.summary}</p>}

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-body">
            <div className="flex items-center gap-1.5">
              <Clock size={14} aria-hidden />
              <dt className="sr-only">Total time</dt>
              <dd>{formatMinutes(recipe.total_minutes)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={14} aria-hidden />
              <dt className="sr-only">Servings originales</dt>
              <dd>{recipe.servings}</dd>
            </div>
            <div>
              <dt className="sr-only">Difficulty</dt>
              <dd className="font-body">{formatDifficulty(recipe.difficulty)}</dd>
            </div>
            {recipe.est_cost != null && (
              <div>
                <dt className="sr-only">Cost estimado</dt>
                <dd>{formatCost(recipe.est_cost * factor, recipe.currency)}</dd>
              </div>
            )}
            {recipe.rating_count > 0 && (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Rating</dt>
                <dd>
                  {formatRating(recipe.rating_avg)} ★{' '}
                  <span className="text-muted">({recipe.rating_count})</span>
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <Button
                size="sm"
                onClick={() =>
                  toggleSave.mutate({ recipeId: recipe.recipe_id, saved })
                }
              >
                <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} aria-hidden />
                {saved ? 'Saved' : 'Save'}
              </Button>
            )}

            {user && (
              <Button size="sm" onClick={collectionDialog.show}>
                <FolderPlus size={14} aria-hidden />
                To a collection
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                toast('Link copied', 'success');
              }}
            >
              <Share2 size={14} aria-hidden />
              Share
            </Button>

            {isAuthor && (
              <Link
                to={`/r/${recipe.slug}/edit`}
                className="text-sm text-body underline transition-colors hover:text-ink"
              >
                Edit
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {recipe.cover_image_url ? (
            <img
              src={recipe.cover_image_url}
              alt={recipe.title}
              className="h-[260px] w-full rounded-card border border-line-strong object-cover"
            />
          ) : (
            <div className="flex h-[260px] w-full items-center justify-center rounded-card border border-line-strong bg-surface">
              <span className="text-6xl font-semibold text-muted">
                {recipe.title.slice(0, 1)}
              </span>
            </div>
          )}

          {nutrition && (
            <dl className="grid grid-cols-4 overflow-hidden rounded-card border border-line-strong bg-surface text-center">
              <NutritionCell label="kcal" value={nutrition.calories} />
              <NutritionCell label="prot" value={nutrition.protein_g} suffix="g" />
              <NutritionCell label="carb" value={nutrition.carbs_g} suffix="g" />
              <NutritionCell label="gras" value={nutrition.fat_g} suffix="g" />
              {nutrition.is_estimated && (
                <p className="col-span-4 border-t border-hairline px-2 py-1.5 text-[10px] text-muted">
                  Estimated per serving, derived from the ingredients.
                </p>
              )}
            </dl>
          )}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[20rem_1fr]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {/* v1's section headings: uppercase, red, quiet. */}
            <h2 className="mb-1.5 text-sm font-semibold uppercase text-brand">Ingredients</h2>
            <ServingsStepper value={servings} base={recipe.servings} onChange={setServings} />
          </div>

          <IngredientLedger
            ingredients={recipe.recipe_ingredients}
            baseServings={recipe.servings}
            servings={servings}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="mb-1.5 text-sm font-semibold uppercase text-brand">Method</h2>
          <StepList steps={recipe.recipe_steps} />
        </section>
      </div>

      <section className="flex flex-col gap-3 border-t border-line pt-8">
        <h2 className="text-xl font-semibold text-ink">
          How did it turn out?
        </h2>
        {user ? (
          <RatingStars
            value={myRating ?? null}
            onRate={(n) =>
              rate.mutate(n, {
                onSuccess: () => toast('Rated', 'success'),
                onError: () => toast('We couldn’t save your rating.', 'error'),
              })
            }
            onClear={() => unrate.mutate()}
          />
        ) : (
          <p className="text-sm text-body">
            <Link to="/login" className="text-brand underline">
              Sign in
            </Link>{' '}
            to rate and save recipes.
          </p>
        )}
      </section>

      <CommentThread recipeId={recipe.recipe_id} />

      <Dialog
        dialogRef={collectionDialog.ref}
        title="Save to a collection"
        onClose={collectionDialog.close}
        footer={
          <Button size="sm" onClick={collectionDialog.close}>
            Close
          </Button>
        }
      >
        {collections && collections.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {collections.map((c) => (
              <li key={c.collection_id}>
                <button
                  type="button"
                  onClick={() =>
                    addToCollection.mutate(
                      { collectionId: c.collection_id, recipeId: recipe.recipe_id },
                      {
                        onSuccess: () => {
                          toast(`Agregada a ${c.name}`, 'success');
                          collectionDialog.close();
                        },
                        onError: () => toast('We couldn’t add it.', 'error'),
                      },
                    )
                  }
                  className="w-full rounded-card border border-line-strong px-3 py-2 text-left text-sm text-body transition-colors hover:bg-hairline"
                >
                  {c.name}
                  {!c.is_public && <span className="ml-2 text-xs text-body">private</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-body">
            You don’t have any collections yet.{' '}
            <Link to="/me/collections" className="text-brand underline">
              Create one
            </Link>
            .
          </p>
        )}
      </Dialog>
    </article>
  );
}

function NutritionCell({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="border-r border-hairline px-2 py-3 last:border-r-0">
      <dd className="font-mono text-base text-ink">
        {value == null ? '—' : Math.round(value)}
        {value != null && suffix}
      </dd>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
    </div>
  );
}
