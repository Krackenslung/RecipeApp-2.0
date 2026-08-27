import { Link } from 'react-router-dom';
import { Clock, Users } from 'lucide-react';
import type { RecipeCard as Card } from '@/queries/useRecipeSearch';
import { formatMinutes } from '@/utils/format';
import noRecipeImage from '@/assets/no_recipe_image.png';

type Props = { recipe: Card };

/**
 * The compact sibling of RecipeCard: a thumbnail, a name, and the two numbers
 * worth knowing before you click. Used on /generate, where the point is to
 * recognise what just came out and open it — not to compare it against a grid.
 *
 * Horizontal rather than a scaled-down feed card, so a run of them reads as a
 * list of results instead of a second, worse feed.
 *
 * The whole row is one link. Splitting the image and the title into separate
 * targets would give a screen reader two links to the same place.
 */
export function GeneratedCard({ recipe }: Props) {
  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';

  return (
    <Link
      to={`/r/${recipe.slug}`}
      className="group flex items-center gap-4 overflow-hidden rounded-card border border-line-strong bg-surface p-3 no-underline shadow-card transition-colors hover:bg-hairline"
    >
      <img
        // Generated recipes have no photo unless image generation is enabled on
        // the Gemini key, so the fallback is the normal case here, not the edge.
        src={recipe.cover_image_url ?? noRecipeImage}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-chip object-cover"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="m-0 truncate text-base font-semibold leading-tight text-ink">
          {recipe.title}
        </h3>

        <div className="flex items-center gap-3 text-xs text-muted">
          {isDraft && (
            <span className="rounded-chip bg-hairline px-2 py-0.5 text-muted">draft</span>
          )}
          {recipe.total_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={12} aria-hidden />
              <span className="font-mono">{formatMinutes(recipe.total_minutes)}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users size={12} aria-hidden />
            <span className="font-mono">{recipe.servings}</span>
          </span>
        </div>
      </div>

      <span className="shrink-0 pr-1 text-sm text-brand group-hover:underline">Open</span>
    </Link>
  );
}
