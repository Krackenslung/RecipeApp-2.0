# CLAUDE 2.0

Guidance for Claude Code when working on **Recipe App 2.0**.

> `CLAUDE.md` and `README.md` in this folder document the previous version and do not apply here. This file is self-contained.

## Status

**No code exists yet.** This repository holds design documents only — no `package.json`, no migrations, no `src/`. Everything below is the target state: the shape new code must take.

Source documents: `Recipe app 2 0 …2.0.md` (architecture) and `recipe_app_diccionario 2.0.md` (domain model). The dictionary is authoritative on *modelling* but is written in T-SQL for SQL Server — the schema below is the Postgres port and supersedes it on every question of type, index and trigger syntax.

## Project overview

An AI-powered recipe app. A user builds a filter — ingredients to include or exclude, cuisines, diets, allergens, cost, difficulty, calories, servings, prep and cook time, free-text comments — and Google Gemini returns structured recipes. Those recipes are persisted, then browsable, savable, ratable, collectable and shareable.

The architectural bet: **the browser talks to Postgres directly.** A browser can't open a Postgres connection (raw TCP vs. HTTP) and credentials shipped in JS are public — so "direct" means PostgREST auto-generating the API over the schema, with Row Level Security enforcing access in the database instead of in a hand-written server. The only server code in the project is one function holding the Gemini key.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Database | Postgres via **Supabase** | Auto-generated REST + realtime over the schema (PostgREST) |
| Auth | **Supabase Auth** (GoTrue) | Native Google provider; issues the JWT that RLS reads |
| Authorization | **Row Level Security** | Enforced in the DB, not the client |
| Frontend | **React 19 + Vite + TypeScript + TanStack Query** | `@supabase/supabase-js` for queries |
| UI | Bootstrap 5 + SweetAlert2 | |
| Server code | **Vercel Functions** | One place for secrets, same deploy target as the frontend |
| Hosting | **Vercel** | Vite build + `api/` picked up automatically |
| Files | **Supabase Storage** | Direct browser upload, storage RLS, CDN URLs |

## Repository layout

```
Recipe App 2.0/
├── api/
│   └── generate.ts             # THE ONLY server code. Holds GEMINI_API_KEY
├── supabase/
│   ├── config.toml
│   ├── migrations/             # forward-only, timestamped, checked in
│   └── seed.sql                # catalog seeds
├── src/
│   ├── lib/supabase.ts         # the single createClient() instance
│   ├── types/database.ts       # GENERATED — never hand-edit
│   ├── queries/                # one file per table, TanStack Query hooks
│   ├── router/
│   ├── hooks/
│   ├── context/
│   ├── components/{layout,ui}/
│   ├── pages/{app,auth}/
│   └── utils/
└── CLAUDE.2.0.md
```

Flat at the repo root — Vercel only auto-detects `api/` when it sits at the project root.

Components never call `supabase` directly; they call hooks from `src/queries/`.

## Running

```powershell
npm install
supabase start          # local Postgres + Auth + Storage in Docker
supabase db reset       # applies every migration, then seed.sql
npm run dev             # Vite on http://localhost:5173
```

`supabase start` prints the local API URL and keys for `.env.local`. Use `vercel dev` instead of `npm run dev` when you need `api/generate.ts` to actually run.

There is no CORS config to maintain and no backend process to start.

## Environment variables

**The most dangerous file in the project.** Vite inlines every `VITE_`-prefixed variable into the client bundle at build time — the prefix is a public/secret switch, not a naming style.

```ini
# .env.local — gitignored
VITE_SUPABASE_URL=...             # public by design
VITE_SUPABASE_ANON_KEY=...        # public by design; RLS is what protects it

GEMINI_API_KEY=...                # NO prefix — server only
SUPABASE_SERVICE_ROLE_KEY=...     # NO prefix — bypasses ALL RLS
```

`service_role` bypasses every policy on every table. If it ever gains a `VITE_` prefix the whole database is public, `ai` schema included. Server-only values are read as `process.env.X` inside `api/`; `import.meta.env.X` for a secret is a bug — `undefined` at runtime *and* the name is scanned into the bundle.

Worth a CI grep for `VITE_.*SERVICE_ROLE`.

---

# The schema

**36 tables across 5 schemas.** Conventions throughout:

| Rule | Decision |
|---|---|
| Primary key | `integer generated always as identity` — narrow indexes, fast joins |
| Public ID | `uuid` on API-exposed tables, so row counts don't leak (see open decision 1) |
| Text | `text` — already Unicode in Postgres; `varchar(n)` buys nothing. Length limits only as `CHECK` where they're a real business rule |
| Timestamps | `timestamptz`, `default now()` — the type carries the zone, so no manual UTC discipline |
| Deletion | Soft (`deleted_at`) on content tables; hard on bridge tables |
| Uniqueness under soft delete | Partial unique index `where deleted_at is null` |
| Booleans | `boolean` with an explicit default |
| Money | `numeric(10,2)` + a `currency` column |

| Schema | Contents | Tables | Exposed to PostgREST |
|---|---|---|---|
| `app` | Identity and permissions | 3 | yes |
| `catalog` | Master data feeding the filters | 11 | yes, read-only |
| `recipe` | The recipe and everything it owns | 10 | yes |
| `ai` | Gemini traceability and cost control | 3 | **no** |
| `social` | Interaction between users | 9 | yes |

Two hard rules: **`auth` and `storage` belong to Supabase** — GoTrue owns `auth`, you cannot create tables there, which is why the identity schema is named `app`. And **`ai` is never added to the exposed-schemas list**; it holds prompts, raw model output and quota counters, touched only by `api/generate.ts` with `service_role`.

Custom schemas aren't exposed by default. Each needs adding to *Settings → API → Exposed schemas*, plus grants:

```sql
grant usage on schema catalog to anon, authenticated;
grant select on all tables in schema catalog to anon, authenticated;
alter default privileges in schema catalog grant select on tables to anon, authenticated;
```

Client-side, a non-`public` schema must be named: `supabase.schema('recipe').from('recipes')`.

## 1. `app` — identity

Supabase Auth owns login entirely: `auth.users` holds email, password hash, email confirmation, `last_sign_in_at` and `banned_until`; `auth.identities` holds the Google link; `auth.sessions` and `auth.refresh_tokens` hold sessions. Password reset and email verification are GoTrue flows.

So three tables from the dictionary's `auth` schema are **deleted rather than ported** — `sessions`, `one_time_tokens` and `user_identities` — along with the `password_hash`, `failed_logins`, `locked_until`, `email`, `email_normalized`, `email_verified_at`, `last_login_at` and `public_id` columns. GoTrue already does all of it, and `id` *is* the public UUID.

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

A row is created by an `after insert` trigger on `auth.users` (`security definer`) — never by the client, which cannot write to `auth`. **Every other table's `user_id` references `auth.users(id)`, not `app.profiles`.**

### `app.roles`
Fixed catalog: `1 user`, `2 moderator`, `3 admin`.

`role_id smallint` PK with explicit values (not identity) · `code text` unique — this is what policies check · `display_name text`.

### `app.user_roles`
N:N bridge. PK `(user_id, role_id)`, cascade on user delete.

## 2. `catalog` — master data

Every table here follows the same pattern: `id` + `slug` (for URLs and the front end) + `name`, plus an active flag where it applies. Clients get `select` only; inserts come from `api/generate.ts` with `service_role`.

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
Synonyms — "jitomate" → tomate rojo. Drives autocomplete and stops Gemini duplicating ingredients by spelling them differently. **The generate function resolves against this table before creating a new ingredient.**

`alias_id integer identity` PK · `ingredient_id` FK cascade · `alias text` unique per ingredient · `locale text` optional.

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

### `catalog.ingredient_allergens`
N:N bridge. Lets a recipe's allergens be **derived from its ingredients** rather than trusted from whatever the AI declares.

## 3. `recipe` — the recipe and what it owns

### `recipe.recipes`
The central table.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | `integer identity` | PK |
| `public_id` | `uuid` | `default gen_random_uuid()`, the API-facing ID |
| `author_id` | `uuid` | FK → `auth.users`. **Nullable** = system-generated |
| `title` | `text` | |
| `slug` | `text` | Unique among non-deleted |
| `summary` | `text` | Card text |
| `servings` | `smallint` | `CHECK between 1 and 100` |
| `prep_minutes` / `cook_minutes` | `smallint` | |
| `total_minutes` | `smallint generated always as (prep_minutes + cook_minutes) stored` | Indexable; drives the time filter |
| `difficulty` | `smallint` | `CHECK between 1 and 3` |
| `est_cost` | `numeric(10,2)` | Estimated total |
| `currency` | `text` | Default `MXN`, `CHECK (currency ~ '^[A-Z]{3}$')` |
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

Key indexes:
- `ix_recipes_feed` — `(status, visibility, published_at desc)` with `include` of the card columns, so the main listing never touches the base table.
- `ix_recipes_time` — the duration filter.
- `ix_recipes_author` — the profile page.
- Plus an index on `author_id` because RLS policies filter on it.

> The dictionary avoids `on delete cascade` on `author_id` because SQL Server rejects multiple cascade paths to the same table. **Postgres has no such restriction** — that workaround is not ported. Use `on delete set null` here, which keeps AI-generated recipes alive when their author leaves.

### `recipe.recipe_ingredients`

| Column | Type | Notes |
|---|---|---|
| `recipe_ingredient_id` | `integer identity` | PK |
| `recipe_id` | `integer` | FK, cascade |
| `ingredient_id` | `integer` | FK. **Nullable** — if Gemini returns something uncatalogued, the recipe still saves |
| `raw_text` | `text` | The original text, always kept |
| `quantity` | `numeric(10,3)` | `CHECK > 0` |
| `unit_id` | `smallint` | FK → `units` |
| `preparation` | `text` | "picado finamente" |
| `is_optional` | `boolean` | |
| `group_label` | `text` | "Para la salsa" |
| `sort_order` | `smallint` | |

### `recipe.recipe_steps`
`step_id integer identity` PK · `recipe_id` FK cascade · `step_number smallint` unique per recipe · `instruction text` · `duration_minutes smallint` (feeds the front-end timer) · `image_url text`.

### `recipe.recipe_nutrition`
1:1 with the recipe, values **per serving**. `is_estimated` separates computed from declared.

Columns: `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`, `is_estimated`, `calculated_at`.

### `recipe.recipe_images`
Gallery: `url`, `alt_text`, `aspect`, `sort_order`.

### Filter bridge tables

| Table | Composite PK | Reverse index |
|---|---|---|
| `recipe.recipe_cuisines` | `(recipe_id, cuisine_id)` | `ix_rc_cuisine` |
| `recipe.recipe_diets` | `(recipe_id, diet_id)` | `ix_rd_diet` |
| `recipe.recipe_tags` | `(recipe_id, tag_id)` | `ix_rt_tag` |
| `recipe.recipe_meal_types` | `(recipe_id, meal_type_id)` | — |
| `recipe.recipe_equipment` | `(recipe_id, equipment_id)` | — |

The reverse indexes are what stop "give me Italian recipes" from scanning the whole table.

## 4. `ai` — traceability and cost control

**Never exposed to PostgREST.** Written only by `api/generate.ts` using `service_role`.

### `ai.generation_requests`
One row per Gemini call. Without it you can't tell what a generation costs or why it failed.

| Column | Type | Notes |
|---|---|---|
| `request_id` | `bigint identity` | PK |
| `public_id` | `uuid` | So the front end can poll status |
| `user_id` | `uuid` | FK → `auth.users` |
| `prompt` | `text` | |
| `filters_json` | `jsonb` | Exact snapshot of the sidebar. `jsonb` validates structurally and indexes with GIN — no `ISJSON` check needed |
| `model` | `text` | To compare versions |
| `status` | `text` | `pending` \| `success` \| `failed` \| `filtered` |
| `tokens_input` / `tokens_output` | `integer` | Real cost |
| `latency_ms` | `integer` | |
| `error_message` | `text` | |
| `created_at` / `completed_at` | `timestamptz` | |

### `ai.generation_results`
Raw response plus the persisted recipe.

`result_id bigint identity` PK · `request_id` FK cascade · `recipe_id integer` FK, **nullable** (there was a response but the parser failed) · `raw_response jsonb` — always stored, even on failure. It's the only way to debug a bad generation.

### `ai.usage_quota`
Rate limiting **persisted**, not held in process memory — Vercel Functions are stateless and per-invocation, so an in-memory counter is meaningless.

PK `(user_id, usage_date)` · `request_count` · `token_count`.

## 5. `social`

### `social.ratings`
PK `(user_id, recipe_id)` — **the combination is the identity**, which gives one vote per user per recipe for free. `rating` with `CHECK between 1 and 5`.

### `social.comments`

| Column | Type | Notes |
|---|---|---|
| `comment_id` | `bigint identity` | PK |
| `recipe_id` | `integer` | FK, cascade |
| `user_id` | `uuid` | FK → `auth.users` |
| `parent_id` | `bigint` | Self-reference, one level of threading |
| `body` | `text` | |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | Soft delete preserves the thread |

### `social.saved_recipes`
PK `(user_id, recipe_id)` + `saved_at` + `notes`. Fires the trigger that maintains `recipes.save_count`.

### `social.collections` / `social.collection_recipes`
Collections with `public_id`, `is_public`, and a name unique per user (partial index). The bridge carries `sort_order` for manual ordering.

### `social.follows`
PK `(follower_id, followee_id)` with `CHECK (follower_id <> followee_id)`.

### `social.user_diet_preferences` / `social.user_allergen_preferences`
Preload the sidebar filters on login. Simple bridges against `catalog`.

### `social.reports`
Polymorphic moderation.

`report_id bigint identity` PK · `reporter_id uuid` FK → `auth.users` · `target_type text` (`recipe` \| `comment` \| `user`) · `target_id bigint` **without FK — polymorphic, validated in app code** · `reason` / `details` · `status text` (`open` \| `reviewing` \| `resolved` \| `dismissed`) · `resolved_by` / `resolved_at`.

## Triggers

| Trigger | Table | Does |
|---|---|---|
| `tr_recipes_updated` | `recipe.recipes` | Refreshes `updated_at` when the UPDATE doesn't carry it |
| `tr_ratings_aggregate` | `social.ratings` | Recomputes `rating_avg` and `rating_count` |
| `tr_saved_aggregate` | `social.saved_recipes` | Recomputes `save_count` |

The dictionary writes these set-based over T-SQL's `inserted`/`deleted` pseudo-tables. Postgres row triggers have no equivalent — use `NEW`/`OLD` in a plpgsql `for each row` trigger, or keep the set-based shape with a statement-level trigger and transition tables (`referencing new table as new_rows`).

## Views

**`recipe.vw_recipe_cards`** — everything a listing card needs in one query: recipe data, author, calories, and cuisines/diets concatenated with `string_agg`. Already filters `deleted_at is null`.

```sql
create view recipe.vw_recipe_cards with (security_invoker = true) as ...
```

`security_invoker` is **mandatory**. A Postgres view runs with its owner's privileges by default, so without it this view returns every row regardless of the policies on the underlying tables. It is the easiest way to accidentally publish the entire database — check it on every view.

---

# Row Level Security

The browser holds the `anon` key, which is public. **RLS is the only thing between that key and the database.** A table in an exposed schema without RLS enabled is a table anyone on the internet can read.

Every table gets policies in the same migration that creates it:

```sql
alter table recipe.recipes enable row level security;

create policy "read published or own"
  on recipe.recipes for select
  using (
    (status = 'published' and visibility = 'public')
    or author_id = (select auth.uid())
  );

create policy "insert own"
  on recipe.recipes for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "update own"
  on recipe.recipes for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
```

Rules, every time:

- **Wrap `auth.uid()` in a subselect** — `(select auth.uid())`. Bare, it re-evaluates per row; wrapped, Postgres hoists it into an InitPlan. On a large table that's the difference between a scan and an index seek.
- **Index every column a policy filters on.** A policy on `author_id` with no index makes every query a sequential scan.
- **One policy per operation.** A single `for all` policy conflates read and write rules and is almost always wrong.
- **Scope writes `to authenticated`** so `anon` isn't even evaluated.
- **Catalog tables get `select` policies only.**

Role checks go through a helper, never an inline subquery on `app.user_roles` — a policy on `user_roles` that queries `user_roles` recurses:

```sql
create or replace function app.has_role(check_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.user_roles ur
    join app.roles r on r.role_id = ur.role_id
    where ur.user_id = (select auth.uid()) and r.code = check_code
  );
$$;
```

`security definer` + `set search_path = ''` with fully-qualified names is required on any function used inside a policy.

# Migrations

Forward-only, one concern per file, always checked in:

```powershell
supabase migration new add_recipe_nutrition
supabase db reset          # local: replay everything
supabase db push           # remote: apply pending
```

Never edit a migration that has been pushed — write a new one. Never change the schema through the Supabase dashboard; it has no history and the next `db reset` silently discards it.

After any migration that alters a table shape:

```powershell
supabase gen types typescript --local > src/types/database.ts
```

That file is generated output. Don't hand-edit it — if it's wrong, the migration is wrong.

# Data access from the frontend

All CRUD goes through `supabase-js` wrapped in TanStack Query. There is no REST API of our own to `fetch`.

```ts
// src/queries/useRecipes.ts
export function useRecipes(filters: RecipeFilters) {
  return useQuery({
    queryKey: ['recipes', filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('recipe')
        .from('vw_recipe_cards')
        .select('*')
        .lte('total_minutes', filters.maxMinutes)
        .order('published_at', { ascending: false })
        .range(0, 19);
      if (error) throw error;
      return data;
    },
  });
}
```

- **Always check `error`.** `supabase-js` returns `{ data, error }` and does not throw. An unchecked error reads as an empty result — exactly how an RLS misconfiguration hides.
- **Never write `user_id` from the client.** Give the column `default auth.uid()` and let the `with check` policy enforce it. User identity comes from the token, never the request body.
- **Select columns explicitly**, except from views built for a screen.
- **Always paginate** with `.range()`. PostgREST will happily return the whole table.
- **Use embedded resources** (`select('*, recipe_ingredients(*)')`) instead of N+1 round-trips.
- **One `createClient()`** for the whole app, in `src/lib/supabase.ts`. Multiple instances fight over the session in storage.

# The Gemini function — `api/generate.ts`

The only server code in the project. It exists because `GEMINI_API_KEY` cannot ship to a browser.

1. Read the caller's access token from the `Authorization` header. **Verify it** — build a client with the anon key and that token, call `getUser()`, reject on failure. This is a public URL protected by nothing else.
2. Check `ai.usage_quota` for `(user_id, current_date)`; reject over-quota callers.
3. Insert `ai.generation_requests` with `status = 'pending'`, the prompt, model and `filters_json`.
4. Call `gemini-2.5-flash` with `responseMimeType: 'application/json'` and a `responseSchema`, so the reply parses with `JSON.parse` and no repair step. Retry up to 3 times with linear backoff, **on 503 and 429 only**.
5. Persist with `service_role`, resolving ingredients through `catalog.ingredient_aliases` before creating new ones.
6. Update the request row: `status`, token counts, `latency_ms`, `completed_at`. Store the raw response in `ai.generation_results` even on parse failure.
7. **Wrap persistence in a transaction** via an RPC (`create function ai.persist_generation(payload jsonb)`). Sequential unbatched inserts leave partial data on a mid-way failure.

Return `{ data }` / `{ error }`, matching the `supabase-js` shape so callers handle both paths identically. Never return the raw exception — log it, return a generic message.

`service_role` is used **only** in this file, and only after step 1 has established who the caller is. Using it before verifying the token gives any anonymous request full database access.

# Storage

Bucket `recipe-images`, **public**. Recipe photos are meant to be seen, and a public bucket gives permanent CDN URLs that drop straight into `<img src>`. Private buckets need signed URLs that expire and must be re-signed on every page load — real friction for something that isn't secret.

Uploads go **browser → Supabase directly**, with the user's own JWT. No server hop.

The path convention `{user_id}/{recipe_id}/{filename}` is load-bearing — the policy reads the first segment:

```sql
create policy "users upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

Filenames must be `crypto.randomUUID()`, never the original upload name: public bucket means anyone with the URL can view, and predictable paths are enumerable.

Add a separate **private** bucket if something non-public appears later (profile photos that shouldn't be enumerable). Don't make `recipe-images` private to solve that.

# Conventions

**Modules:** ESM everywhere (`import` / `export`).

**TypeScript:** `.ts` / `.tsx`. Database types come from `src/types/database.ts` — don't hand-write row interfaces that will drift.

**SQL identifiers:** `snake_case`, lowercase, unquoted. Tables plural (`recipes`); bridge tables both nouns plural (`recipe_cuisines`); booleans `is_`/`has_` prefixed; timestamps `_at` suffixed.

**Every migration that creates a table must, in the same file:** enable RLS, create its policies, and create the indexes those policies depend on. A table shipped without policies is a data leak, and splitting it across migrations means the leak exists in between.

**Errors:** never surface a raw Postgres or Gemini error to the user — messages leak column names, constraint definitions and prompt content. Log the detail, show a generic message via SweetAlert2.

**Comments:** never delete existing comments in the user's code. Preserve them as written when editing a file.

# Build order

1. `supabase init`, Vite + React + TS scaffold, `src/lib/supabase.ts`.
2. Migration — `app.profiles`, `app.roles`, `app.user_roles`, the `auth.users` trigger, `app.has_role()`, RLS on all three.
3. Migration — `catalog` (11 tables) + `seed.sql`: 11 units, 10 cuisines, 9 diets, 9 allergens, 6 meal types, 7 equipment, 8 ingredient categories. Read-only policies.
4. Auth UI — email/password + Google, `src/hooks/useAuth`, protected routes. **Verify RLS by signing in as two users and confirming each sees only their own rows.** Do this before there is data worth leaking.
5. Migration — `recipe` (10 tables), the `updated_at` trigger, `vw_recipe_cards` with `security_invoker`.
6. Recipe browse and detail UI against seeded data.
7. Migration — `ai` (3 tables). `api/generate.ts` + the transactional persist RPC.
8. Migration — `social` (9 tables) and the two aggregate triggers.
9. Storage bucket and policies.

# Open decisions

1. **Dual IDs.** The dictionary pairs `integer identity` PKs with a separate public `uuid`, to keep indexes narrow without leaking row counts. But PostgREST *is* the API, so it exposes whatever the client filters on — every client query would go through `public_id` while every FK join goes through the int. **Recommendation: collapse to `uuid primary key default gen_random_uuid()`** on API-exposed tables (`recipes`, `collections`, `generation_requests`) and keep integer identity PKs only on catalog and bridge tables, which are never addressed individually. Undecided.
2. **Streaming from `api/generate.ts`.** `responseSchema` + `application/json` gives one parseable payload but no progress during a 20–30s generation. Streaming means partial JSON on the wire and an incremental client parser. Currently specced non-streaming.
3. **Ratings vs reviews.** `social.ratings` (numeric) and `social.comments` (text) are independent. Amazon-style reviews would merge them.
4. **Cost: total or per serving.** `est_cost` stores the total; a per-serving filter has to divide by `servings`.
5. **Multi-language.** Only `recipes.language` exists. Real translation needs `*_translations` tables for recipes, steps and ingredients.
6. **Table count.** The dictionary's header says `catalog` has 9 tables but lists 11, and `auth` 6 (3 survive under Supabase Auth). Actual total is **36**, not 37.
