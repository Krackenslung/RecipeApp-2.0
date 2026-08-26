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
        title="Esta receta no existe"
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

  if (!recipe || servings == null) return null;

  const isAuthor = user?.id === recipe.author_id;
  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';
  const nutrition = recipe.recipe_nutrition;
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;

  return (
    <article className="flex flex-col gap-10">
      {isDraft && isAuthor && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-guajillo/40 px-4 py-3">
          <p className="text-sm text-comal">
            Esta receta es un borrador privado. El modelo propone, tú publicas.
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={publish.isPending}
            onClick={() =>
              publish.mutate(recipe.recipe_id, {
                onSuccess: () => toast('Publicada', 'success'),
                onError: () => toast('No pudimos publicarla. Inténtalo de nuevo.', 'error'),
              })
            }
          >
            Publicar
          </Button>
        </div>
      )}

      <header className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-comal">
            {recipe.title}
          </h1>

          {recipe.summary && <p className="max-w-2xl text-base text-ceniza">{recipe.summary}</p>}

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-ceniza">
            <div className="flex items-center gap-1.5">
              <Clock size={14} aria-hidden />
              <dt className="sr-only">Tiempo total</dt>
              <dd>{formatMinutes(recipe.total_minutes)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={14} aria-hidden />
              <dt className="sr-only">Porciones originales</dt>
              <dd>{recipe.servings}</dd>
            </div>
            <div>
              <dt className="sr-only">Dificultad</dt>
              <dd className="font-body">{formatDifficulty(recipe.difficulty)}</dd>
            </div>
            {recipe.est_cost != null && (
              <div>
                <dt className="sr-only">Costo estimado</dt>
                <dd>{formatCost(recipe.est_cost * factor, recipe.currency)}</dd>
              </div>
            )}
            {recipe.rating_count > 0 && (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Calificación</dt>
                <dd>
                  {formatRating(recipe.rating_avg)} ★{' '}
                  <span className="text-ceniza/70">({recipe.rating_count})</span>
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
                {saved ? 'Guardada' : 'Guardar'}
              </Button>
            )}

            {user && (
              <Button size="sm" onClick={collectionDialog.show}>
                <FolderPlus size={14} aria-hidden />
                A una colección
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                toast('Liga copiada', 'success');
              }}
            >
              <Share2 size={14} aria-hidden />
              Compartir
            </Button>

            {isAuthor && (
              <Link
                to={`/r/${recipe.slug}/edit`}
                className="text-sm text-ceniza underline transition-colors hover:text-comal"
              >
                Editar
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {recipe.cover_image_url ? (
            <img
              src={recipe.cover_image_url}
              alt={recipe.title}
              className="aspect-[4/3] w-full border border-ceniza/20 object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center border border-ceniza/20 bg-cal">
              <span className="font-display text-6xl font-black text-ceniza/20">
                {recipe.title.slice(0, 1)}
              </span>
            </div>
          )}

          {nutrition && (
            <dl className="grid grid-cols-4 border border-ceniza/20 bg-cal text-center">
              <NutritionCell label="kcal" value={nutrition.calories} />
              <NutritionCell label="prot" value={nutrition.protein_g} suffix="g" />
              <NutritionCell label="carb" value={nutrition.carbs_g} suffix="g" />
              <NutritionCell label="gras" value={nutrition.fat_g} suffix="g" />
              {nutrition.is_estimated && (
                <p className="col-span-4 border-t border-ceniza/15 px-2 py-1.5 text-[10px] text-ceniza">
                  Estimado por porción, calculado desde los ingredientes.
                </p>
              )}
            </dl>
          )}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[20rem_1fr]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-black tracking-tight text-comal">
              Ingredientes
            </h2>
            <ServingsStepper value={servings} base={recipe.servings} onChange={setServings} />
          </div>

          <IngredientLedger
            ingredients={recipe.recipe_ingredients}
            baseServings={recipe.servings}
            servings={servings}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-black tracking-tight text-comal">Pasos</h2>
          <StepList steps={recipe.recipe_steps} />
        </section>
      </div>

      <section className="flex flex-col gap-3 border-t border-ceniza/20 pt-8">
        <h2 className="font-display text-xl font-black tracking-tight text-comal">
          ¿Qué tal quedó?
        </h2>
        {user ? (
          <RatingStars
            value={myRating ?? null}
            onRate={(n) =>
              rate.mutate(n, {
                onSuccess: () => toast('Calificada', 'success'),
                onError: () => toast('No pudimos guardar tu calificación.', 'error'),
              })
            }
            onClear={() => unrate.mutate()}
          />
        ) : (
          <p className="text-sm text-ceniza">
            <Link to="/login" className="text-guajillo underline">
              Entra
            </Link>{' '}
            para calificar y guardar recetas.
          </p>
        )}
      </section>

      <CommentThread recipeId={recipe.recipe_id} />

      <Dialog
        dialogRef={collectionDialog.ref}
        title="Guardar en una colección"
        onClose={collectionDialog.close}
        footer={
          <Button size="sm" onClick={collectionDialog.close}>
            Cerrar
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
                        onError: () => toast('No pudimos agregarla.', 'error'),
                      },
                    )
                  }
                  className="w-full border border-ceniza/25 px-3 py-2 text-left text-sm transition-colors hover:border-comal"
                >
                  {c.name}
                  {!c.is_public && <span className="ml-2 text-xs text-ceniza">privada</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ceniza">
            Todavía no tienes colecciones.{' '}
            <Link to="/me/collections" className="text-guajillo underline">
              Crea una
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
    <div className="border-r border-ceniza/15 px-2 py-3 last:border-r-0">
      <dd className="font-mono text-base text-comal">
        {value == null ? '—' : Math.round(value)}
        {value != null && suffix}
      </dd>
      <dt className="text-[10px] uppercase tracking-wide text-ceniza">{label}</dt>
    </div>
  );
}
