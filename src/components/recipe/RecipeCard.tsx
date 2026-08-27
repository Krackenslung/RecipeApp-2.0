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
 * From RecipeCard.css, with one deliberate departure: the card carries
 * `shadow-card`. UI-MIGRATION.md §3 asks for no shadow; this is an explicit
 * override, so the shadow is a token rather than a one-off class.
 */
export function RecipeCard({ recipe, saved, onToggleSave }: Props) {
  const cuisines = splitAgg(recipe.cuisines);
  const diets = splitAgg(recipe.diets);
  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';

  return (
    <article className="group relative flex cursor-pointer flex-col overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
      <Link to={`/r/${recipe.slug}`} className="flex flex-1 flex-col no-underline">
        <div className="h-[180px] w-full overflow-hidden bg-hairline">
          {recipe.cover_image_url ? (
            <img
              src={recipe.cover_image_url}
              alt=""
              loading="lazy"
              className="h-[180px] w-full object-cover"
            />
          ) : (
            // PLACEHOLDER — no_recipe_image.png is not in src/assets/ yet.
            // Until then, the initial over v1's grey.
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-4xl font-bold text-muted">{recipe.title.slice(0, 1)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <h3 className="m-0 line-clamp-2 flex-1 text-base font-semibold leading-tight text-ink">
              {recipe.title}
            </h3>
            {isDraft && (
              <span className="mt-0.5 shrink-0 rounded-chip bg-hairline px-2 py-0.5 text-xs text-muted">
                draft
              </span>
            )}
          </div>

          {recipe.summary && (
            <p className="line-clamp-2 text-sm text-body">{recipe.summary}</p>
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
        </div>

        <dl className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hairline px-4 py-2.5 font-mono text-xs text-muted">
          <div className="flex items-center gap-1">
            <Clock size={12} aria-hidden />
            <dt className="sr-only">Time</dt>
            <dd>{formatMinutes(recipe.total_minutes)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <Users size={12} aria-hidden />
            <dt className="sr-only">Servings</dt>
            <dd>{recipe.servings}</dd>
          </div>
          {recipe.est_cost != null && (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Cost</dt>
              <dd>{formatCost(recipe.est_cost, recipe.currency)}</dd>
            </div>
          )}
          {recipe.rating_count > 0 && (
            <div className="flex items-center gap-1">
              <Star size={12} aria-hidden className="text-brand" />
              <dt className="sr-only">Rating</dt>
              <dd>
                {formatRating(recipe.rating_avg)}
                <span> ({recipe.rating_count})</span>
              </dd>
            </div>
          )}
        </dl>
      </Link>

      {onToggleSave && (
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save recipe'}
          className={cx(
            'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-card border bg-surface transition-colors',
            saved
              ? 'border-brand text-brand'
              : 'border-line-strong text-muted hover:border-brand hover:text-brand',
          )}
        >
          <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </button>
      )}
    </article>
  );
}
