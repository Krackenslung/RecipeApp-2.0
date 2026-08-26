import { Link } from 'react-router-dom';
import { Bookmark, Clock, Star, Users } from 'lucide-react';
import type { RecipeCard as Card } from '@/queries/useRecipeSearch';
import { Tag } from '@/components/ui/Chip';
import { formatCost, formatMinutes, formatRating, splitAgg } from '@/utils/format';
import { cx } from '@/utils/cx';

type Props = {
  recipe: Card;
  saved?: boolean;
  onToggleSave?: () => void;
};

/**
 * No shadow. A 1px border and a flat bg-cal — a drop shadow here is the
 * templated answer and it is what v1 looked like.
 */
export function RecipeCard({ recipe, saved, onToggleSave }: Props) {
  const cuisines = splitAgg(recipe.cuisines);
  const diets = splitAgg(recipe.diets);
  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';

  return (
    <article className="group relative flex flex-col border border-ceniza/20 bg-cal">
      <Link to={`/r/${recipe.slug}`} className="flex flex-1 flex-col">
        <div className="aspect-[4/3] w-full overflow-hidden bg-masa">
          {recipe.cover_image_url ? (
            <img
              src={recipe.cover_image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-display text-4xl font-black text-ceniza/25">
                {recipe.title.slice(0, 1)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 font-display text-lg font-black leading-tight tracking-tight text-comal">
              {recipe.title}
            </h3>
            {isDraft && (
              <span className="mt-0.5 border border-ceniza/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ceniza">
                borrador
              </span>
            )}
          </div>

          {recipe.summary && (
            <p className="line-clamp-2 text-sm text-ceniza">{recipe.summary}</p>
          )}

          {(cuisines.length > 0 || diets.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {cuisines.slice(0, 2).map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
              {diets.slice(0, 2).map((d) => (
                <Tag key={d} tone="diet">
                  {d}
                </Tag>
              ))}
            </div>
          )}

          <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 font-mono text-xs text-ceniza">
            <div className="flex items-center gap-1">
              <Clock size={12} aria-hidden />
              <dt className="sr-only">Tiempo</dt>
              <dd>{formatMinutes(recipe.total_minutes)}</dd>
            </div>
            <div className="flex items-center gap-1">
              <Users size={12} aria-hidden />
              <dt className="sr-only">Porciones</dt>
              <dd>{recipe.servings}</dd>
            </div>
            {recipe.est_cost != null && (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Costo</dt>
                <dd>{formatCost(recipe.est_cost, recipe.currency)}</dd>
              </div>
            )}
            {recipe.rating_count > 0 && (
              <div className="flex items-center gap-1">
                <Star size={12} aria-hidden className="text-guajillo" />
                <dt className="sr-only">Calificación</dt>
                <dd>
                  {formatRating(recipe.rating_avg)}
                  <span className="text-ceniza/70"> ({recipe.rating_count})</span>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Link>

      {onToggleSave && (
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Quitar de guardadas' : 'Guardar receta'}
          className={cx(
            'absolute right-2 top-2 flex h-8 w-8 items-center justify-center border bg-cal transition-colors',
            saved
              ? 'border-guajillo text-guajillo'
              : 'border-ceniza/30 text-ceniza hover:border-comal hover:text-comal',
          )}
        >
          <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </button>
      )}
    </article>
  );
}
