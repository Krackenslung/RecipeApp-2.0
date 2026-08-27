# Recipe App 2.0

An AI-powered recipe app. You build a filter — ingredients to include or exclude, cuisines, diets,
allergens, cost, difficulty, calories, servings, prep and cook time, free-text notes — and Google
Gemini returns structured recipes. Those recipes are persisted, then browsable, savable, ratable,
collectable and shareable.

**The architectural bet: the browser talks to Postgres directly.** A browser can't open a Postgres
connection (raw TCP vs. HTTP) and credentials shipped in JS are public — so "direct" means PostgREST
auto-generating the API over the schema, with Row Level Security enforcing access *in the database*
instead of in a hand-written server. The only server code in the project is one function holding the
Gemini key.

Coding rules and conventions live in `CLAUDE.md`. This file is what the project *is*; that one is
how to write code for it.

---

## Status

The frontend is built. The database and the generation function are specified here but **not in this
repository**.

| Area | State |
|---|---|
| Frontend (`src/`) | **Built** — 14 routes, 11 query hooks, full component library, UI in English |
| Deployment | **Live** on Vercel, SPA rewrite in `vercel.json` |
| Database migrations | **Written**, in `supabase/migrations/`. Never yet run against a real Postgres |
| Catalog seed | **Written**, in `supabase/seed.sql` |
| `src/types/database.ts` | **Hand-written** from the schema below, deliberately narrow. Becomes generated output the moment migrations exist |
| `api/generate.ts` | **Written**, and typechecked by `tsconfig.node.json`. Never yet run |
| Storage bucket + policies | **Written**, in the storage migration |

So `/generate` is the one screen that cannot work yet: the client half exists and the server half
does not.

The migrations have never been applied — they were written from this spec and from the types in
`src/types/database.ts`, with no Postgres available to run them. Treat the first `supabase db reset`
as the real review.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Database | Postgres via **Supabase** | Auto-generated REST + realtime over the schema (PostgREST) |
| Auth | **Supabase Auth** (GoTrue) | Native Google provider; issues the JWT that RLS reads |
| Authorization | **Row Level Security** | Enforced in the DB, not the client |
| Build | **Vite 6 + React 19 + TypeScript** | |
| Server state | **TanStack Query** | `@supabase/supabase-js` underneath |
| Routing | **React Router 7** | `createBrowserRouter`, lazy routes |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` | CSS-first; no `tailwind.config.js` |
| Dialogs | Native `<dialog>` + a `useDialog` hook | |
| Icons | **Lucide React** | |
| Server code | **Vercel Functions** | One place for secrets, same deploy target as the frontend |
| Hosting | **Vercel** | Vite build + `api/` picked up automatically |
| Files | **Supabase Storage** | Direct browser upload, storage RLS, CDN URLs |

Two things the early design documents specified and the code does **not** use: Bootstrap 5 and
SweetAlert2. SweetAlert2 ships its own stylesheet that Tailwind doesn't control, so every dialog
would need overriding to match the rest of the app; native `<dialog>` gets focus trapping,
Escape-to-close and the top layer for free, and takes Tailwind classes directly.

## Running it

```powershell
npm install
npm run dev          # Vite on http://localhost:5173
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then `vite build` |
| `npm run typecheck` | `tsc -b` alone |
| `npm test` | Vitest, one run |
| `npm run test:watch` | Vitest in watch mode |

Once the database work lands, the loop gains `supabase start` (local Postgres + Auth + Storage in
Docker) and `supabase db reset` (replays every migration, then `seed.sql`). Use `vercel dev` rather
than `npm run dev` when `api/generate.ts` needs to actually run.

There is no CORS config to maintain and no backend process to start.

## Environment variables

**The most dangerous file in the project.** Vite inlines every `VITE_`-prefixed variable into the
client bundle at build time — the prefix is a public/secret switch, not a naming style. See
`.env.example`.

```ini
# .env.local — gitignored
VITE_SUPABASE_URL=...             # public by design
VITE_SUPABASE_ANON_KEY=...        # public by design; RLS is what protects it

GEMINI_API_KEY=...                # NO prefix — server only
SUPABASE_SERVICE_ROLE_KEY=...     # NO prefix — bypasses ALL RLS
```

`service_role` bypasses every policy on every table. If it ever gains a `VITE_` prefix the whole
database is public, `ai` schema included. Server-only values are read as `process.env.X` inside
`api/`; `import.meta.env.X` for a secret is a bug — `undefined` at runtime *and* the name is scanned
into the bundle. Worth a CI grep for `VITE_.*SERVICE_ROLE`.

## Deployment

Vercel, building from `main`. The Vite preset does not add an SPA fallback, so `vercel.json` does:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Without it, any deep link — `/auth/callback` on the way back from Google, or a refresh on
`/r/some-recipe` — returns Vercel's edge 404, because the path isn't a file on disk. The filesystem
takes priority over rewrites, so hashed assets under `/assets/` still serve normally.

The OAuth origin must also be listed in Supabase under **Authentication → URL Configuration →
Redirect URLs**, including `/auth/callback`. Vercel preview deployments get a fresh URL each time,
so those need a wildcard pattern.

## Repository layout

```
Recipe App 2.0/
├── vercel.json                 # SPA rewrite
├── index.html
├── src/
│   ├── assets/                 # logo + no_recipe_image fallback, from v1
│   ├── lib/supabase.ts         # the single createClient() instance
│   ├── types/database.ts       # hand-written for now; generated once migrations exist
│   ├── queries/                # one file per resource, TanStack Query hooks
│   ├── router/                 # routes.tsx, RequireAuth.tsx
│   ├── context/AuthProvider.tsx
│   ├── hooks/                  # useDialog, useReducedMotion
│   ├── components/{layout,ui,recipe,filters}/
│   ├── pages/{app,auth}/
│   └── utils/                  # filterArgs, format, cx
│
├── api/
│   └── generate.ts             # THE ONLY server code. Holds GEMINI_API_KEY
└── supabase/
    ├── config.toml             # exposed schemas live here; `ai` is absent on purpose
    ├── migrations/             # forward-only, timestamped, checked in
    └── seed.sql                # catalog seeds
```

Flat at the repo root — Vercel only auto-detects `api/` when it sits at the project root.

Components never call `supabase` directly; they call hooks from `src/queries/`.

---

# The data model

Postgres / Supabase. **36 tables across 5 schemas.**

| Schema | Contents | Tables | Exposed to PostgREST |
|---|---|---|---|
| `app` | Identity and permissions | 3 | yes |
| `catalog` | Master data feeding the filters | 11 | yes, read-only |
| `recipe` | The recipe and everything it owns | 10 | yes |
| `ai` | Gemini traceability and cost control | 3 | **no** |
| `social` | Interaction between users | 9 | yes |

> **service_role does not bypass the exposed-schema list.** It bypasses RLS, which is a different
> thing. `supabase.schema('ai').rpc(...)` 404s whatever key is used, so `api/generate.ts` reaches the
> `ai` schema through three definer wrappers in `recipe` — `gen_begin`, `gen_succeed`, `gen_fail` —
> each granted to `service_role` and revoked from `public`.

Two hard rules. **`auth` and `storage` belong to Supabase** — GoTrue owns `auth` and you cannot
create tables there, which is why the identity schema is named `app`. And **`ai` is never added to
the exposed-schemas list**; it holds prompts, raw model output and quota counters, touched only by
`api/generate.ts` with `service_role`.

Custom schemas aren't exposed by default. Each needs adding under *Settings → API → Exposed schemas*,
plus grants:

```sql
grant usage on schema catalog to anon, authenticated;
grant select on all tables in schema catalog to anon, authenticated;
alter default privileges in schema catalog grant select on tables to anon, authenticated;
```

Client-side, a non-`public` schema must be named: `supabase.schema('recipe').from('recipes')`.

### Type conventions

| Rule | Decision |
|---|---|
| Primary key | `uuid default gen_random_uuid()` on the four API-addressed tables (`app.profiles`, `recipe.recipes`, `social.collections`, `ai.generation_requests`); `integer generated always as identity` everywhere else |
| Text | `text` — already Unicode in Postgres; `varchar(n)` buys nothing. Length limits only as `CHECK` where they're a real business rule |
| Timestamps | `timestamptz`, `default now()` — the type carries the zone, so no manual UTC discipline |
| Deletion | Soft (`deleted_at`) on content tables; hard on bridge tables |
| Uniqueness under soft delete | Partial unique index `where deleted_at is null` |
| Booleans | `boolean` with an explicit default |
| Money | `numeric(10,2)` + a `currency` column |

## 1. `app` — identity

Supabase Auth owns login entirely. `auth.users` holds email, password hash, email confirmation,
`last_sign_in_at` and `banned_until`; `auth.identities` holds the Google link; `auth.sessions` and
`auth.refresh_tokens` hold sessions. Password reset and email verification are GoTrue flows.

Three tables from the original SQL Server dictionary are therefore **deleted rather than ported** —
`sessions`, `one_time_tokens` and `user_identities` — along with the `password_hash`,
`failed_logins`, `locked_until`, `email`, `email_normalized`, `email_verified_at`, `last_login_at`
and `public_id` columns. GoTrue already does all of it, and `id` *is* the public UUID.

### `app.profiles`
1:1 with `auth.users`, sharing its UUID. Everything about a user that isn't credentials.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `references auth.users(id) on delete cascade` |
| `username` | `text` | Unique among active |
| `display_name` | `text` | Visible name |
| `avatar_url` | `text` | |
| `bio` | `text` | |
| `locale` | `text` | Default `es-MX` |
| `is_active` | `boolean` | Administrative suspension, app-level |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |

```sql
create unique index ux_profiles_username
  on app.profiles (lower(username)) where deleted_at is null;
```

The row is created by an `after insert` trigger on `auth.users` (`security definer`) — never by the
client, which cannot write to `auth`. **Every other table's `user_id` references `auth.users(id)`,
not `app.profiles`.**

### `app.roles`
Fixed catalog: `1 user`, `2 moderator`, `3 admin`.

`role_id smallint` PK with explicit values (not identity) · `code text` unique — this is what
`app.has_role()` checks · `display_name text`.

### `app.user_roles`
N:N bridge. PK `(user_id, role_id)`, cascade on user delete.

## 2. `catalog` — master data

Every table follows the same pattern: `id` + `slug` (for URLs and the front end) + `name`, plus an
active flag where it applies. Clients get `select` only; inserts come from `api/generate.ts` with
`service_role`.

### `catalog.units`
The table that makes scaling servings and summing nutrition actually work.

| Column | Type | Notes |
|---|---|---|
| `unit_id` | `smallint identity` | PK |
| `code` | `text` | `g`, `ml`, `tbsp`, `cup`, `pza` |
| `dimension` | `text` | `mass` \| `volume` \| `count` |
| `to_base_factor` | `numeric(18,6)` | Equivalence to g or ml. NULL when `count` |
| `system` | `text` | `metric` \| `imperial` |

Seed: 11 units.

### `catalog.ingredients`

| Column | Type | Notes |
|---|---|---|
| `ingredient_id` | `integer identity` | PK |
| `slug` | `text` | Unique |
| `name` | `text` | |
| `category_id` | `smallint` | FK → `ingredient_categories` |
| `default_unit_id` | `smallint` | FK → `units` |
| `kcal_per_100`, `protein_per_100`, `carbs_per_100`, `fat_per_100` | `numeric(8,2)` | Basis for computing recipe nutrition |
| `avg_cost_per_100` | `numeric(10,2)` | Basis for the cost filter |
| `is_verified` | `boolean` | Separates curated data from what arrived via AI |

### `catalog.ingredient_aliases`
Synonyms — "jitomate" → tomate rojo. Drives autocomplete and stops Gemini duplicating ingredients by
spelling them differently. **`api/generate.ts` resolves against this table before creating a new
ingredient.**

`alias_id integer identity` PK · `ingredient_id` FK cascade · `alias text` unique per ingredient ·
`locale text` optional.

### `catalog.ingredient_allergens`
N:N bridge. Lets a recipe's allergens be **derived from its ingredients** rather than trusted from
whatever the AI declared. `search_recipes()` reads it directly.

### Simple catalogs

| Table | PK | Fields | Seed |
|---|---|---|---|
| `catalog.cuisines` | `smallint` | `slug`, `name`, `region`, `icon`, `is_active` | 10 |
| `catalog.diets` | `smallint` | `slug`, `name`, `description`, `is_active` | 9 |
| `catalog.allergens` | `smallint` | `slug`, `name` | 9 |
| `catalog.meal_types` | `smallint` | `slug`, `name`, `sort_order` | 6 |
| `catalog.equipment` | `smallint` | `slug`, `name` | 7 |
| `catalog.ingredient_categories` | `smallint` | `slug`, `name` | 8 |
| `catalog.tags` | `integer` | `slug`, `name`, `usage_count` | — |

## 3. `recipe`

### `recipe.recipes`

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | `uuid` | PK, `default gen_random_uuid()` — this *is* the API-facing ID |
| `author_id` | `uuid` | FK → `auth.users`, `on delete set null`. **Nullable** = system-generated |
| `title` | `text` | |
| `slug` | `text` | Unique among non-deleted |
| `summary` | `text` | Card text |
| `servings` | `smallint` | `check between 1 and 100` |
| `prep_minutes` / `cook_minutes` | `smallint` | |
| `total_minutes` | `smallint generated always as (coalesce(prep_minutes,0) + coalesce(cook_minutes,0)) stored` | The `coalesce` is load-bearing: without it a null half makes the whole column null, and the time filter silently drops the recipe |
| `difficulty` | `smallint` | `check between 1 and 3` |
| `est_cost` | `numeric(10,2)` | Estimated **total** |
| `currency` | `text` | Default `MXN`, `check (currency ~ '^[A-Z]{3}$')` |
| `cover_image_url` | `text` | |
| `source_type` | `text` | `ai` \| `user` \| `imported` |
| `source_url` | `text` | If imported |
| `status` | `text` | `draft` \| `published` \| `archived` |
| `visibility` | `text` | `private` \| `unlisted` \| `public` |
| `language` | `text` | |
| `rating_avg` | `numeric(3,2)` | **Denormalized**, trigger-maintained |
| `rating_count` | `integer` | **Denormalized**, trigger |
| `save_count` | `integer` | **Denormalized**, trigger |
| `view_count` | `integer` | Incremented by the app |
| `published_at` | `timestamptz` | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |

Indexes:
- `ix_recipes_feed` — `(status, visibility, published_at desc)` with `include` of the card columns,
  so the main listing never touches the base table.
- `ix_recipes_time` — the duration filter.
- `ix_recipes_author` — the profile page **and** the RLS policy, which filters on `author_id`.
- `ix_recipes_search` — GIN over `to_tsvector(title || summary)`.

> The original SQL Server dictionary avoided `on delete cascade` on `author_id` because SQL Server
> rejects multiple cascade paths to the same table. **Postgres has no such restriction** — that
> workaround is not ported. `on delete set null` keeps AI-generated recipes alive when their author
> leaves.

### `recipe.recipe_ingredients`

| Column | Type | Notes |
|---|---|---|
| `recipe_ingredient_id` | `integer identity` | PK |
| `recipe_id` | `uuid` | FK, cascade |
| `ingredient_id` | `integer` | FK. **Nullable** — if Gemini returns something uncatalogued, the recipe still saves |
| `raw_text` | `text` | The original text, always kept |
| `quantity` | `numeric(10,3)` | `check > 0` |
| `unit_id` | `smallint` | FK → `units` |
| `preparation` | `text` | "picado finamente" |
| `is_optional` | `boolean` | Optional ingredients still count for allergen exclusion |
| `group_label` | `text` | "Para la salsa" |
| `sort_order` | `smallint` | |

### `recipe.recipe_steps`
`step_id integer identity` PK · `recipe_id uuid` FK cascade · `step_number smallint` unique per
recipe · `instruction text` · `duration_minutes smallint` (feeds the front-end timer) ·
`image_url text`.

### `recipe.recipe_nutrition`
1:1 with the recipe, values **per serving**. `is_estimated` separates computed from declared.

`recipe_id uuid` PK/FK · `calories` · `protein_g` · `carbs_g` · `fat_g` · `fiber_g` · `sugar_g` ·
`sodium_mg` · `is_estimated` · `calculated_at`.

### `recipe.recipe_images`
Gallery: `url`, `alt_text`, `aspect`, `sort_order`.

### Filter bridge tables

| Table | Composite PK | Reverse index |
|---|---|---|
| `recipe.recipe_cuisines` | `(recipe_id, cuisine_id)` | `ix_rc_cuisine` |
| `recipe.recipe_diets` | `(recipe_id, diet_id)` | `ix_rd_diet` |
| `recipe.recipe_tags` | `(recipe_id, tag_id)` | `ix_rt_tag` |
| `recipe.recipe_meal_types` | `(recipe_id, meal_type_id)` | `ix_rmt_meal` |
| `recipe.recipe_equipment` | `(recipe_id, equipment_id)` | `ix_re_equip` |

The reverse indexes are what stop "give me Italian recipes" from scanning the whole table. All five
are read by `search_recipes()`.

## 4. `ai` — traceability and cost control

**Never exposed to PostgREST.** RLS enabled with **zero policies**, so only `service_role` gets
through. Written only by `api/generate.ts`.

### `ai.generation_requests`
One row per Gemini call. Without it you can't tell what a generation costs or why it failed.

| Column | Type | Notes |
|---|---|---|
| `request_id` | `uuid` | PK, `default gen_random_uuid()` — returned to the client so it can poll |
| `user_id` | `uuid` | FK → `auth.users` |
| `prompt` | `text` | |
| `filters_json` | `jsonb` | Exact snapshot of the sidebar. `jsonb` validates structurally and indexes with GIN |
| `model` | `text` | To compare versions |
| `status` | `text` | `pending` \| `success` \| `failed` \| `filtered` |
| `tokens_input` / `tokens_output` | `integer` | Real cost |
| `latency_ms` | `integer` | |
| `error_message` | `text` | |
| `created_at` / `completed_at` | `timestamptz` | |

### `ai.generation_results`
`result_id integer identity` PK · `request_id uuid` FK cascade · `recipe_id uuid` FK, **nullable**
(there was a response but the parser failed) · `raw_response jsonb` — always stored, even on failure.
It's the only way to debug a bad generation.

### `ai.usage_quota`
Rate limiting **persisted**, not held in process memory — Vercel Functions are stateless per
invocation, so an in-memory counter is meaningless.

PK `(user_id, usage_date)` · `request_count` · `token_count`.

## 5. `social`

### `social.ratings`
PK `(user_id, recipe_id)` — **the combination is the identity**, which gives one vote per user per
recipe for free. `rating smallint check between 1 and 5`.

### `social.comments`

| Column | Type | Notes |
|---|---|---|
| `comment_id` | `integer identity` | PK |
| `recipe_id` | `uuid` | FK, cascade |
| `user_id` | `uuid` | FK → `auth.users` |
| `parent_id` | `integer` | Self-reference, one level of threading |
| `body` | `text` | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | Soft delete preserves the thread |

### `social.saved_recipes`
PK `(user_id, recipe_id)` + `saved_at` + `notes`. Fires the trigger that maintains
`recipes.save_count`.

### `social.collections` / `social.collection_recipes`
`collection_id uuid` PK · `user_id uuid` FK · `name text` unique per user (partial index) ·
`description` · `cover_image_url` · `is_public boolean` · `created_at` / `deleted_at`. The bridge is
PK `(collection_id, recipe_id)` + `sort_order` for manual ordering + `added_at`.

### `social.follows`
PK `(follower_id, followee_id)` with `check (follower_id <> followee_id)`.

### `social.user_diet_preferences` / `social.user_allergen_preferences`
Preload the sidebar filters on login. Simple bridges against `catalog`.

### `social.reports`
Polymorphic moderation.

`report_id integer identity` PK · `reporter_id uuid` FK → `auth.users` · `target_type text`
(`recipe` \| `comment` \| `user`) · `target_id text` **without FK — polymorphic, validated in app
code** · `reason` / `details` · `status text` (`open` \| `reviewing` \| `resolved` \| `dismissed`) ·
`resolved_by` / `resolved_at`.

> `target_id` is `text`, not `bigint`: targets now have mixed key types (`recipes` is uuid,
> `comments` is integer). Cast on read.

## Triggers

| Trigger | Table | Security | Does |
|---|---|---|---|
| `tr_profiles_from_auth` | `auth.users` | **definer** | Creates the `app.profiles` row on signup |
| `tr_recipes_updated` | `recipe.recipes` | invoker | Refreshes `updated_at` — touches only `NEW`, its own row |
| `tr_ratings_aggregate` | `social.ratings` | **definer** | Recomputes `rating_avg`, `rating_count` on `recipe.recipes` |
| `tr_saved_aggregate` | `social.saved_recipes` | **definer** | Recomputes `save_count` on `recipe.recipes` |

The two aggregate triggers write to a table the invoking user does not own. Without
`security definer` the UPDATE is filtered by the `"update own"` policy, matches zero rows, and
raises no error — the counters freeze silently, which is close to undebuggable from the UI.

## Views and functions

**`recipe.vw_recipe_cards`** — everything a listing card needs in one query: recipe data, author,
calories, and cuisines/diets concatenated with `string_agg`. Filters `deleted_at is null`.
`search_recipes()` returns `setof` this view.

```sql
create view recipe.vw_recipe_cards with (security_invoker = true) as ...
```

| Function | Schema | Security | Purpose |
|---|---|---|---|
| `has_role(check_code text)` | `app` | definer | Role check used inside policies |
| `search_recipes(...)` | `recipe` | **invoker** | The main browse/filter query |
| `count_recipes(...)` | `recipe` | invoker | Result count for pagination |
| `persist_generation(payload jsonb)` | `ai` | definer | Transactional write of a generated recipe |
| `get_generation_status(p_request_id uuid)` | **`recipe`** | definer | The client's only window into `ai`. Lives in an exposed schema because PostgREST can only call what it can see; returns rows owned by `auth.uid()` and nothing else |
| `increment_view_count(p_recipe_id uuid)` | `recipe` | definer | `view_count` is bumped by readers, who cannot update a recipe they don't own |
| `gen_begin` / `gen_succeed` / `gen_fail` | `recipe` | definer | The server-side entry points for `api/generate.ts`. Granted to `service_role` only — see below |

---

# The frontend

## Routes

Public routes render for `anon`; RLS already limits what comes back, so an anonymous visitor
browsing the feed is a supported state, not a bug.

| Path | Screen | Auth |
|---|---|---|
| `/` | Feed — result grid + filter rail | public |
| `/r/:slug` | Recipe detail | public |
| `/r/:slug/edit` | Recipe editor | required, author only |
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

**Route protection is a layout, not a per-page check.** `RequireAuth`, `RequireAnon` and
`RequireRole` are route elements wrapping their branch. A page that checks auth in its own body will
flash content before redirecting. Every page is `lazy()` behind a shared `<Suspense>` spinner.

**Session expiry:** `supabase.auth.onAuthStateChange` lives in exactly one place
(`src/context/AuthProvider.tsx`) and drives a context. On `SIGNED_OUT` or `TOKEN_REFRESH_FAILED`,
the TanStack Query cache is cleared — stale rows from the previous user's session must not survive a
sign-out.

## The filter → RPC mapping

The most error-prone code in the frontend. It gets its own module, `src/utils/filterArgs.ts`, and
its own tests (`filterArgs.test.ts`, 17 cases).

**Two pieces of state, not one.** The sidebar holds `draft`; the query reads `applied`. They diverge
until the user presses **Search**.

```ts
const [draft, setDraft] = useState<RecipeFilters>(EMPTY_FILTERS);
const [applied, setApplied] = useState<RecipeFilters>(EMPTY_FILTERS);

// Only `applied` is ever in the query key.
const { data } = useQuery({
  queryKey: ['recipes', 'search', applied],
  queryFn: () => searchRecipes(applied),
});
```

If `draft` reaches the query key, every keystroke refetches and the Search button is decorative.
This is the whole reason the two exist.

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

**Surface ANY vs ALL in the UI.** The RPC treats cuisines and meal types as ANY, but diets,
equipment and included ingredients as ALL. A user selecting "vegan" and "keto" gets zero results and
will read that as a bug. Label the diet group "must satisfy all", or show the count of active
constraints next to the result count.

**Allergen preferences preload.** On sign-in, `social.user_allergen_preferences` and
`user_diet_preferences` seed `draft`. Make it visibly pre-filled, not silently applied — a user who
can't find a recipe should be able to see why.

## Data layer

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
  useUpload.ts           browser → Supabase Storage
  useGeneration.ts       start + realtime status subscription
```

**Query key convention:** `[resource, operation, params]` — `['recipes','search',applied]`,
`['recipe','detail',slug]`, `['catalog','cuisines']`.

**Catalogue data never goes stale.** Cuisines, diets, allergens, units and meal types change on the
order of never. `staleTime: Infinity`, fetched once at app start.

**Optimistic updates on ratings and saves**, because both drive a counter the user is watching. On
error, roll back and invalidate — the aggregate lives in `recipe.recipes` and is written by a
trigger, so the authoritative value only arrives on refetch.

**Infinite scroll on the feed**, `useInfiniteQuery` with `p_offset`. There's no total count; don't
build a numbered pager.

## Components

```
src/components/
  layout/     AppShell, Header, Sidebar, TwoPaneLayout, FilterSidebar
  ui/         Button, Chip, Dialog, Field, Toast, states (Spinner/Empty/Error)
  recipe/     RecipeCard, IngredientLedger, StepList, ServingsStepper, RatingStars,
              CommentThread, TickingNumber
  filters/    IngredientAutocomplete, TagGroup, RangeField
```

`Footer` and `CostField` don't exist: the three-zone grid has no footer row, and cost is three toggle
buttons rather than a slider.

**`ui/` owns the Tailwind vocabulary.** `Button` decides what "primary" means; nothing else writes
those classes. This is what stops the class strings drifting across fifty files.

**Every list state is designed**, not defaulted: loading (skeleton cards, not a spinner), empty, and
error. The empty state on a filtered feed should say which constraint is narrowest and offer to clear
it — "No recipes with all 4 ingredients. Remove one?" beats "No results".

## The generation screen

The one place the async design becomes visible, and the one screen whose server half isn't written.

1. `POST /api/generate` returns `{ request_id }` in under a second.
2. Subscribe to that row via Supabase realtime; fall back to polling
   `ai.get_generation_status(request_id)` every 3s if the socket doesn't connect.
3. Generation takes 20–30s. **Don't show a fake progress bar.** Show elapsed time and what's
   happening.
4. On `success`, the recipe exists as **`draft` / `private`** — route to it with an explicit
   "Publish" action. The model proposes; the user publishes.
5. On `failed`, show the generic message and keep the filters intact so retrying is one click.

Quota lives in `ai.usage_quota` and is enforced server-side. The client can't read it, so surface
remaining quota in the 429-equivalent response body rather than querying for it.

### What `api/generate.ts` has to do

1. Read the caller's access token from the `Authorization` header. **Verify it** — build a client
   with the anon key and that token, call `getUser()`, reject on failure. This is a public URL
   protected by nothing else.
2. Check `ai.usage_quota` for `(user_id, current_date)`; reject over-quota callers.
3. Insert `ai.generation_requests` with `status = 'pending'`, the prompt, model and `filters_json`.
4. Call `gemini-2.5-flash` with `responseMimeType: 'application/json'` and a `responseSchema`, so the
   reply parses with `JSON.parse` and no repair step. Retry up to 3 times with linear backoff, **on
   503 and 429 only**.
5. Persist through `ai.persist_generation(payload jsonb)` — one transaction for the whole recipe
   tree. Sequential unbatched inserts leave partial data on a mid-way failure. Resolve ingredients
   through `catalog.ingredient_aliases` before creating new ones.
6. Update the request row: `status`, token counts, `latency_ms`, `completed_at`. Store the raw
   response in `ai.generation_results` even on parse failure.

Return `{ data }` / `{ error }`, matching the `supabase-js` shape so callers handle both paths
identically. Never return the raw exception — log it, return a generic message.

`service_role` is used **only** in this file, and only after step 1 has established who the caller
is. Using it before verifying the token gives any anonymous request full database access.

## Storage

Bucket `recipe-images`, **public**. Recipe photos are meant to be seen, and a public bucket gives
permanent CDN URLs that drop straight into `<img src>`. Private buckets need signed URLs that expire
and must be re-signed on every page load — real friction for something that isn't secret.

Uploads go **browser → Supabase directly**, with the user's own JWT. No server hop.

The path convention `{user_id}/{recipe_id}/{filename}` is load-bearing — the policy reads the first
segment:

```sql
create policy "users upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

Filenames must be `crypto.randomUUID()`, never the original upload name: public bucket means anyone
with the URL can view, and predictable paths are enumerable.

Add a separate **private** bucket if something non-public appears later (profile photos that
shouldn't be enumerable). Don't make `recipe-images` private to solve that.

---

# Design

The look is ported from Recipe App 1.0 — the earlier 2.0 direction (a kitchen palette named
`masa`/`comal`/`guajillo`, Fraunces as a display face, and a rule that the accent appear on exactly
one thing per screen) was **reversed**. 1.0's look is the target, not the antipattern. None of those
tokens exist and no class in `src/` refers to them.

**Tailwind v4 is CSS-first.** There is no `tailwind.config.js`. The whole design system is `@theme`
in `src/index.css`, and every token there becomes a utility automatically — `bg-surface`,
`text-brand`, `border-line`, `rounded-card`.

```css
@theme {
  /* Text */
  --color-ink:          #1a1a1a;   /* headings, recipe names */
  --color-body:         #555555;   /* body copy, labels, inactive nav */
  --color-muted:        #888888;   /* metadata, card footer */

  /* Surfaces */
  --color-surface:      #ffffff;   /* header, sidebar, cards, filter rail */
  --color-canvas:       #f8f9fa;   /* content area background */

  /* Borders — three weights, not one */
  --color-line:         #e9ecef;   /* chrome: header, sidebar, rails */
  --color-line-strong:  #dddddd;   /* card border */
  --color-hairline:     #f0f0f0;   /* internal rules, chip background */

  /* Accent */
  --color-brand:        #e74c3c;
  --color-brand-dark:   #c0392b;   /* primary button hover */
  --color-brand-soft:   #fdecea;   /* active nav background */
  --color-success:      #198754;   /* selected cost level */

  --radius-card: 8px;
  --radius-chip: 4px;
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.06), 0 2px 6px rgb(0 0 0 / 0.06);

  --font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

- **`--color-brand` is the only accent, and it's used generously**: active nav, primary buttons,
  section headings, ingredient bullets, numbered step badges.
- **No dark mode.** `color-scheme: light`, no `dark:` variants anywhere.
- **Inter throughout.** JetBrains Mono is scoped to quantities, times and costs, where tabular
  figures keep the ingredient ledger aligned.
- **One elevation.** `--shadow-card` goes on `RecipeCard`, `SkeletonCard` (which has to match or the
  list pops when data lands), the collection tiles, and the auth card. Panels, dialogs and list rows
  stay flat and are told apart by their `line-strong` border.

## The shell

A three-zone app grid, measured from 1.0's `Layout.css`:

| Zone | Measurement | Style |
|---|---|---|
| Header | `60px`, full width | `bg-surface`, `border-b border-line`, sticky, side padding `1.5rem` |
| Sidebar | `240px`, column 1 | `bg-surface`, `border-r border-line`, sticky under the header, own scroll |
| Content | `1fr`, column 2 | `bg-canvas`, padding `2rem`, `overflow-y-auto` |

```tsx
<div className="grid h-dvh grid-cols-[240px_1fr] grid-rows-[60px_1fr]">
```

The container is `h-dvh`, not `min-h-dvh`. A sticky header inside a 60px grid row has no travel to
stick through, so it scrolls away; pinning the grid to the viewport and letting `<main>` be the
scroller is what actually holds the chrome in place.

Nav links live in the sidebar (active link `bg-brand-soft text-brand`); the profile dropdown stays in
the header, next to the logo. `/` and `/generate` split into a results pane plus a 500px filter rail
(`TwoPaneLayout`); below `lg` the panes stack and the rail becomes a `<dialog>`.

## Signature details

**The ingredient ledger.** Recipe detail lays ingredients out as a two-column ledger — quantity in
mono, right-aligned, leading to the ingredient name. Scaling servings animates only the numbers,
which stay aligned because they're tabular.

**Motion is restrained.** Filter results cross-fade, servings numbers tick, nothing else.
`prefers-reduced-motion` turns the servings ticker into an instant swap.

**Icons are Lucide**, never Font Awesome (which is what 1.0 used, via CDN). Default size `16`, `20`
in the sidebar, always `aria-hidden` when there's text alongside.

**Images.** `src/assets/` holds the two PNGs carried over from 1.0: the header logo
(`recipes_powered_by_gemini_logo.png`, at `h-9`) and `no_recipe_image.png`, the cover fallback on
both the card and the detail page. They are imported as modules so Vite fingerprints them; nothing
lives in a `public/` folder.

## Language

The UI is in **English** — all copy, `lang="en"`, `en-US` locales in `format.ts`. Catalog names
(cuisines, diets, allergens, ingredients) still come from the database in Spanish, and
`app.profiles.locale` still defaults to `es-MX`.

---

# What's left to build

1. Run the migrations for the first time: `supabase start` then `supabase db reset`. They have never
   been executed, so expect this step to find things — it is the first real test of
   `supabase/migrations/`.
2. `supabase gen types typescript --local > src/types/database.ts` to replace the hand-written copy
   with generated output, then `npm run typecheck` to see where the two disagreed.
3. **Verify RLS by signing in as two users and confirming each sees only their own rows.** Before
   there is data worth leaking.
4. Set `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the Vercel project, then exercise
   `/generate` end to end. `api/generate.ts` is written but has never run.

# Open decisions

1. **Streaming from `api/generate.ts`.** `responseSchema` + `application/json` gives one parseable
   payload but no progress during a 20–30s generation. Streaming means partial JSON on the wire and
   an incremental client parser. Currently specced non-streaming.
2. **Ratings vs reviews.** `social.ratings` (numeric) and `social.comments` (text) are independent.
   Amazon-style reviews would merge them.
3. **Cost: total or per serving.** `est_cost` stores the total; a per-serving filter has to divide by
   `servings`. The RPC takes `p_cost_per_serving` as a flag.
4. **Multi-language.** Only `recipes.language` exists. Real translation needs `*_translations` tables
   for recipes, steps and ingredients — and would settle the English-UI-over-Spanish-catalog split
   noted above.
5. **Mono type.** JetBrains Mono is a departure from 1.0, which used Bootstrap's system stack
   throughout. Kept because tabular figures align the ledger; drop it and the Google Fonts `<link>`
   for total fidelity.
