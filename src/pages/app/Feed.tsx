import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { FilterSidebar } from '@/components/layout/FilterSidebar';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/states';
import { flattenPages, useRecipeSearch } from '@/queries/useRecipeSearch';
import { useSavedIds, useToggleSave } from '@/queries/useSaved';
import { useAllergenPreferences, useDietPreferences } from '@/queries/useProfile';
import { useAuth } from '@/context/AuthProvider';
import {
  clearConstraint,
  countActive,
  EMPTY_FILTERS,
  narrowestConstraint,
  type RecipeFilters,
  type SortKey,
} from '@/utils/filterArgs';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recientes' },
  { key: 'rating', label: 'Mejor calificadas' },
  { key: 'quick', label: 'Más rápidas' },
  { key: 'cheap', label: 'Más baratas' },
  { key: 'popular', label: 'Más guardadas' },
];

export default function Feed() {
  // Two pieces of state, not one. The sidebar edits `draft`; only `applied`
  // ever reaches the query key. If draft got in there every keystroke would
  // refetch and the Search button would be decorative.
  const [draft, setDraft] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { user } = useAuth();
  const { data: dietPrefs } = useDietPreferences();
  const { data: allergenPrefs } = useAllergenPreferences();
  const seeded = useRef(false);

  // Preferences seed the sidebar once, on sign-in. Visibly pre-filled, never
  // silently applied — a user who finds nothing should be able to see why.
  useEffect(() => {
    if (seeded.current || !user) return;
    if (!dietPrefs && !allergenPrefs) return;
    seeded.current = true;
    const next: RecipeFilters = {
      ...EMPTY_FILTERS,
      diets: dietPrefs ?? [],
      excludeAllergens: allergenPrefs ?? [],
    };
    setDraft(next);
    setApplied(next);
  }, [user, dietPrefs, allergenPrefs]);

  const query = useRecipeSearch(applied);
  const recipes = flattenPages(query.data?.pages);

  const { data: savedIds } = useSavedIds();
  const toggleSave = useToggleSave();

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(applied),
    [draft, applied],
  );
  const activeCount = countActive(applied);
  const narrowest = narrowestConstraint(applied);

  // Infinite scroll. There is no total count — a numbered pager would be a lie.
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

  function applySort(sort: SortKey) {
    setDraft((d) => ({ ...d, sort }));
    setApplied((a) => ({ ...a, sort }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
      <aside
        className={
          sidebarOpen
            ? 'fixed inset-0 z-40 overflow-y-auto bg-masa p-4 lg:static lg:z-auto lg:overflow-visible lg:p-0'
            : 'hidden lg:block'
        }
      >
        <div className="mb-4 flex justify-end lg:hidden">
          <Button size="sm" variant="ghost" onClick={() => setSidebarOpen(false)}>
            Cerrar
          </Button>
        </div>
        <FilterSidebar
          draft={draft}
          onDraftChange={setDraft}
          onApply={() => {
            setApplied(draft);
            setSidebarOpen(false);
          }}
          onReset={() => {
            setDraft(EMPTY_FILTERS);
            setApplied(EMPTY_FILTERS);
          }}
          dirty={dirty}
          searching={query.isFetching && !query.isFetchingNextPage}
          seededDiets={dietPrefs ?? []}
          seededAllergens={allergenPrefs ?? []}
        />
      </aside>

      <section className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-comal">
              Recetas
            </h1>
            <p className="mt-1 text-sm text-ceniza">
              {query.isLoading
                ? 'Buscando…'
                : `${recipes.length}${query.hasNextPage ? '+' : ''} ${
                    recipes.length === 1 ? 'receta' : 'recetas'
                  }`}
              {activeCount > 0 && (
                <span className="text-ceniza">
                  {' '}
                  · {activeCount} {activeCount === 1 ? 'filtro' : 'filtros'} activos
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <SlidersHorizontal size={14} aria-hidden />
              Filtros
            </Button>

            <label className="sr-only" htmlFor="sort">
              Ordenar
            </label>
            <select
              id="sort"
              value={applied.sort}
              onChange={(e) => applySort(e.target.value as SortKey)}
              className="border border-ceniza/35 bg-cal px-2 py-1.5 text-sm text-comal focus:border-comal focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {query.isLoading ? (
          <SkeletonGrid />
        ) : query.isError ? (
          <ErrorState
            message="No pudimos cargar las recetas."
            onRetry={() => void query.refetch()}
          />
        ) : recipes.length === 0 ? (
          <EmptyState
            title={narrowest ? 'Nada con esos filtros' : 'Todavía no hay recetas'}
            message={
              narrowest?.message ??
              'Genera la primera y aparecerá aquí en cuanto la publiques.'
            }
            action={
              narrowest && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const next = clearConstraint(applied, narrowest.key);
                    setDraft(next);
                    setApplied(next);
                  }}
                >
                  Quitar {narrowest.label}
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Filter results cross-fade. Keyed on the applied set so a new
                search fades rather than snapping. */}
            <div
              key={JSON.stringify(applied)}
              className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {recipes.map((r) => (
                <RecipeCard
                  key={r.recipe_id}
                  recipe={r}
                  saved={savedIds?.includes(r.recipe_id)}
                  onToggleSave={
                    user
                      ? () =>
                          toggleSave.mutate({
                            recipeId: r.recipe_id,
                            saved: Boolean(savedIds?.includes(r.recipe_id)),
                          })
                      : undefined
                  }
                />
              ))}
            </div>

            <div ref={sentinel} className="h-12" aria-hidden />

            {query.isFetchingNextPage && <SkeletonGrid count={3} />}
            {!query.hasNextPage && recipes.length > 0 && (
              <p className="py-4 text-center text-xs text-ceniza">Es todo por ahora.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
