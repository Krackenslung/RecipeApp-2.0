# CLAUDE — Recipe App 2.0, frontend

Companion to `CLAUDE.md`, which covers the database, RLS and the generation function. This file covers everything above `src/lib/supabase.ts`. Read both.

# Stack

| Layer | Choice |
|---|---|
| Build | Vite + React 19 + TypeScript |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` |
| Server state | TanStack Query |
| Routing | React Router |
| Dialogs | Native `<dialog>` + a `useDialog` hook |
| Icons | Lucide React |

**Tailwind v4 is CSS-first.** There is no `tailwind.config.js` unless you add one. The whole setup is:

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-masa:      #F0E6D2;
  --color-comal:     #1C1917;
  --color-guajillo:  #A63A24;
  --color-tomatillo: #6B7F3A;
  --color-cal:       #FAF7F0;
  --color-ceniza:    #78716C;

  --font-display: "Fraunces", Georgia, serif;
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", monospace;
}
```

Every token in `@theme` becomes a utility automatically — `bg-masa`, `text-guajillo`, `font-display`. **Don't write arbitrary values** (`bg-[#A63A24]`); if a colour is worth using twice it belongs in `@theme`.

**SweetAlert2 is dropped.** It ships its own stylesheet that Tailwind doesn't control, so every dialog would need overriding to look like the rest of the app. Native `<dialog>` gets focus trapping, Escape-to-close and the top layer for free, and takes Tailwind classes directly.

# Design direction

**This section is a pointer. `UI-MIGRATION.md` is the specification.** It replaces what used to be here, and where the two disagree, `UI-MIGRATION.md` wins.

The earlier direction defined a palette named for the kitchen (`masa`, `comal`, `guajillo`, `tomatillo`, `cal`, `ceniza`), Fraunces as the display face, and a rule that the accent appear on exactly one thing per screen — all of it argued as a deliberate move away from v1. That call is reversed. **v1's look is the target, not the antipattern.** Those tokens no longer exist in `@theme` and no class in `src/` refers to them.

What replaces it, in short — the detail lives in `UI-MIGRATION.md`:

- **Palette**: `ink` / `body` / `muted` for text, `surface` / `canvas` for grounds, `line` / `line-strong` / `hairline` as three distinct border weights, `brand` (`#e74c3c`) as the accent with `brand-dark` and `brand-soft`, and `success` for selected cost levels. All of it in `@theme`; no arbitrary color values anywhere in `src/`. Light only — no `dark:` variants.
- **The accent is used generously.** Active nav, primary buttons, section headings, ingredient bullets, step badges. The one-guajillo-per-screen rule is gone.
- **Type**: Inter throughout. **Fraunces is removed**, along with `font-display`. JetBrains Mono stays, scoped to quantities, times and costs.
- **Shell**: a three-zone app grid — 60px header, 240px sidebar, `1fr` content — not a horizontal nav over a centered `max-w-7xl`. Nav links live in the sidebar; the profile menu stays in the header. `/` and `/generate` split into results plus a 500px filter rail.

Two things survive from the original direction because `UI-MIGRATION.md` explicitly keeps them:

**Signature: the ingredient ledger.** Recipe detail lays ingredients as a two-column ledger — quantity in mono, right-aligned, leading to the ingredient name. Scaling servings animates only the numbers, which stay aligned because they're tabular. The hairline rule is now v1's red bullet, but the two-column shape is unchanged.

**Cards have no shadows.** Still true, and still the rule — but for a different reason than before. v1 didn't have shadows either; a card is told apart by its `line-strong` border and the white against the canvas. This was never the thing that made v1 look like v1.

**Motion is restrained.** Filter results cross-fade, servings numbers tick, nothing else. Respect `prefers-reduced-motion` — the servings ticker becomes an instant swap.

# Routes

Public routes render for `anon`; RLS already limits what comes back, so an anonymous visitor browsing the feed is a supported state, not a bug.

| Path | Screen | Auth |
|---|---|---|
| `/` | Feed — filter sidebar + result grid | public |
| `/r/:slug` | Recipe detail | public |
| `/generate` | Generation form and status | **required** |
| `/login`, `/signup` | Auth | public only (redirect if signed in) |
| `/auth/callback` | Google/OAuth landing | — |
| `/me` | Own profile, own recipes incl. drafts | required |
| `/me/saved` | Saved recipes | required |
| `/me/collections` | Collection list | required |
| `/u/:username` | Public profile | public |
| `/c/:id` | Collection detail | public if `is_public` |
| `/settings` | Profile, diet and allergen preferences | required |
| `/moderation` | Report queue | `has_role('moderator')` |

`/moderation` is last in the build order and lowest priority — it's operationally useful only once there are users to moderate.

**Route protection is a layout, not a per-page check.** One `<RequireAuth>` route element wrapping the authenticated branch. A page that checks auth in its own body will flash content before redirecting.

**Session expiry:** `supabase.auth.onAuthStateChange` in one place (`src/context/AuthProvider.tsx`) drives a context. On `SIGNED_OUT` or `TOKEN_REFRESH_FAILED`, clear the TanStack Query cache — stale rows from the previous user's session must not survive a sign-out.

# The filter → RPC mapping

The most error-prone code in the frontend. It gets its own module, `src/utils/filterArgs.ts`, and its own tests.

**Two pieces of state, not one.** The sidebar holds `draft`; the query reads `applied`. They diverge until the user presses **Search**.

```ts
const [draft, setDraft] = useState<RecipeFilters>(EMPTY_FILTERS);
const [applied, setApplied] = useState<RecipeFilters>(EMPTY_FILTERS);

// Only `applied` is ever in the query key.
const { data } = useQuery({
  queryKey: ['recipes', 'search', applied],
  queryFn: () => searchRecipes(applied),
});
```

If `draft` reaches the query key, every keystroke refetches and the Search button is decorative. This is the whole reason the two exist.

**Shape:**

```ts
export type RecipeFilters = {
  includeIngredients: number[];   // catalog.ingredients.ingredient_id
  excludeIngredients: number[];
  cuisines: number[];
  diets: number[];
  mealTypes: number[];
  excludeAllergens: number[];
  equipment: number[];
  maxMinutes: number | null;
  maxCost: number | null;
  costPerServing: boolean;
  maxCalories: number | null;
  maxDifficulty: 1 | 2 | 3 | null;
  minServings: number | null;
  maxServings: number | null;
  minRating: number | null;
  search: string;
  sort: 'recent' | 'rating' | 'quick' | 'cheap' | 'popular';
};
```

**Mapping rules:**

- **IDs, never names.** The autocomplete stores `ingredient_id`; the label is display only. Sending a name silently matches nothing.
- **Empty array means "no constraint".** Never send `null` for an array parameter — omit it or send `[]`. `null` is not the same thing to the RPC.
- **`null` is the no-constraint value for scalars.** `0` is a real constraint and will return nothing.
- **Omit defaults.** Send only the keys the user actually set; `supabase-js` sends what you give it and the function fills the rest.
- **`p_author_id` is not part of the sidebar.** It's set by the screen: `/me` passes the user's ID, `/` passes nothing.
- **Pagination is `p_offset`**, page size fixed at 20. The function caps at 50.

```ts
export function toRpcArgs(f: RecipeFilters, page = 0, authorId?: string) {
  const args: Record<string, unknown> = { p_offset: page * 20, p_limit: 20 };
  if (f.includeIngredients.length) args.p_include_ingredients = f.includeIngredients;
  if (f.excludeIngredients.length) args.p_exclude_ingredients = f.excludeIngredients;
  if (f.cuisines.length)           args.p_cuisines            = f.cuisines;
  if (f.diets.length)              args.p_diets               = f.diets;
  if (f.mealTypes.length)          args.p_meal_types          = f.mealTypes;
  if (f.excludeAllergens.length)   args.p_exclude_allergens   = f.excludeAllergens;
  if (f.equipment.length)          args.p_equipment           = f.equipment;
  if (f.maxMinutes    != null)     args.p_max_minutes         = f.maxMinutes;
  if (f.maxCalories   != null)     args.p_max_calories        = f.maxCalories;
  if (f.maxDifficulty != null)     args.p_max_difficulty      = f.maxDifficulty;
  if (f.minServings   != null)     args.p_min_servings        = f.minServings;
  if (f.maxServings   != null)     args.p_max_servings        = f.maxServings;
  if (f.minRating     != null)     args.p_min_rating          = f.minRating;
  if (f.maxCost       != null) {
    args.p_max_cost = f.maxCost;
    args.p_cost_per_serving = f.costPerServing;
  }
  if (f.search.trim())             args.p_search              = f.search.trim();
  if (f.sort !== 'recent')         args.p_sort                = f.sort;
  if (authorId)                    args.p_author_id           = authorId;
  return args;
}
```

**Surface ANY vs ALL in the UI.** The RPC treats cuisines and meal types as ANY, but diets, equipment and included ingredients as ALL. A user selecting "vegan" and "keto" gets zero results and will read that as a bug. Label the diet group "must satisfy all" or show the count of active constraints next to the result count.

**Allergen preferences preload.** On sign-in, `social.user_allergen_preferences` and `user_diet_preferences` seed `draft`. Make it visibly pre-filled, not silently applied — a user who can't find a recipe should be able to see why.

# Data layer

One file per resource in `src/queries/`, exporting hooks. Components never import `supabase`.

```
src/queries/
  useRecipeSearch.ts     search_recipes + infinite scroll
  useRecipe.ts           single recipe + embedded children
  useCatalog.ts          cuisines, diets, allergens, units — staleTime: Infinity
  useIngredientSearch.ts autocomplete against catalog.ingredients
  useRatings.ts          rate / unrate, optimistic
  useSaved.ts            save / unsave, optimistic
  useCollections.ts
  useComments.ts
  useProfile.ts
  useGeneration.ts       start + realtime status subscription
```

**Query key convention:** `[resource, operation, params]` — `['recipes','search',applied]`, `['recipe','detail',slug]`, `['catalog','cuisines']`.

**Catalogue data never goes stale.** Cuisines, diets, allergens, units and meal types change on the order of never. `staleTime: Infinity`, fetched once at app start.

**Optimistic updates on ratings and saves**, because both drive a counter the user is watching. On error, roll back and invalidate — the aggregate lives in `recipe.recipes` and is written by a trigger, so the authoritative value only arrives on refetch.

**Infinite scroll on the feed**, `useInfiniteQuery` with `p_offset`. There's no total count; don't build a numbered pager.

**Always destructure `error`.** `supabase-js` resolves rather than throws, so an unchecked error is indistinguishable from an empty result — which is exactly how an RLS misconfiguration hides.

# Components

```
src/components/
  layout/     AppShell, Header, Sidebar, TwoPaneLayout, FilterSidebar
  ui/         Button, Chip, Dialog, Field, Spinner, EmptyState
  recipe/     RecipeCard, IngredientLedger, StepList, ServingsStepper, RatingStars
  filters/    IngredientAutocomplete, TagGroup, RangeField
```

`Footer` and `CostField` are gone: the three-zone grid has no footer row, and cost is three toggle buttons now rather than a slider.

**`ui/` owns the Tailwind vocabulary.** A `Button` decides what `btn-primary` means; nothing else writes those classes. This is what stops the class strings drifting across fifty files.

**Every list state is designed**, not defaulted: loading (skeleton cards, not a spinner), empty, and error. The empty state on a filtered feed should say which constraint is narrowest and offer to clear it — "No recipes with all 4 ingredients. Remove one?" beats "No results".

**Copy rules** (from `CLAUDE.md`): active voice, sentence case, the button that says "Publish" produces a toast that says "Published". Never surface a raw Postgres or Gemini error — log it, show a plain message.

# Generation screen

The one place the async design becomes visible.

1. `POST /api/generate` returns `{ request_id }` in under a second.
2. Subscribe to that row via Supabase realtime; fall back to polling `recipe.get_generation_status(request_id)` every 3s if the socket doesn't connect.
3. Generation takes 20–30s. **Don't show a fake progress bar.** Show elapsed time and what's happening.
4. On `success`, the recipe exists as **`draft` / `private`** — route to it with an explicit "Publish" action. The model proposes; the user publishes.
5. On `failed`, show the generic message and keep the filters intact so retrying is one click.

Quota lives in `ai.usage_quota` and is enforced server-side. The client can't read it, so surface remaining quota in the 429-equivalent response body rather than querying for it.

# Build order

1. Vite + React + TS + Tailwind v4 scaffold, `@theme` tokens, `src/lib/supabase.ts`, `supabase gen types`.
2. `AuthProvider`, `RequireAuth`, login/signup/callback. **Verify RLS with two accounts before going further.**
3. `ui/` primitives and `AppShell`.
4. `useCatalog` + `FilterSidebar` — the sidebar is buildable before any recipe exists, against seeded catalogue data.
5. `filterArgs.ts` with tests, then `useRecipeSearch` and the feed grid.
6. Recipe detail and the ingredient ledger.
7. Storage upload, then recipe create/edit.
8. Ratings, saves, comments.
9. `/generate` and `api/generate.ts`.
10. Collections, follows, public profiles.
11. `/moderation`.
