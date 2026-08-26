# Recipe App 2.0 — data dictionary

Postgres / Supabase. **36 tables across 5 schemas.** Conventions, RLS rules and the reasoning behind them live in `CLAUDE.md`; this file is reference only.

| Schema | Contents | Tables | Exposed |
|---|---|---|---|
| `app` | Identity and permissions | 3 | yes |
| `catalog` | Master data feeding the filters | 11 | read-only |
| `recipe` | The recipe and everything it owns | 10 | yes |
| `ai` | Gemini traceability and cost control | 3 | **no** |
| `social` | Interaction between users | 9 | yes |

Primary keys: `uuid default gen_random_uuid()` on the four API-addressed tables (`app.profiles`, `recipe.recipes`, `social.collections`, `ai.generation_requests`); `integer generated always as identity` everywhere else. Timestamps are `timestamptz default now()`.

---

## 1. `app` — identity

Supabase Auth owns login entirely. `auth.users` holds email, password hash, email confirmation, `last_sign_in_at`, `banned_until`; `auth.identities` holds the Google link; `auth.sessions` and `auth.refresh_tokens` hold sessions. Password reset and email verification are GoTrue flows.

Three tables from the v1 dictionary are therefore **deleted rather than ported** — `sessions`, `one_time_tokens`, `user_identities` — along with the `password_hash`, `failed_logins`, `locked_until`, `email`, `email_normalized`, `email_verified_at` and `last_login_at` columns.

### `app.profiles`
1:1 with `auth.users`, sharing its UUID. Everything about a user that isn't credentials.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `references auth.users(id) on delete cascade` |
| `username` | `text` | Unique among active |
| `display_name` | `text` | |
| `avatar_url` | `text` | |
| `bio` | `text` | |
| `locale` | `text` | Default `es-MX` |
| `is_active` | `boolean` | Administrative suspension, app-level |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | |

```sql
create unique index ux_profiles_username
  on app.profiles (lower(username)) where deleted_at is null;
```

The row is created by an `after insert` trigger on `auth.users` (`security definer`) — never by the client, which cannot write to `auth`.

### `app.roles`
Fixed catalog: `1 user`, `2 moderator`, `3 admin`.

`role_id smallint` PK with explicit values (not identity) · `code text` unique — this is what `app.has_role()` checks · `display_name text`.

### `app.user_roles`
N:N bridge. PK `(user_id, role_id)`, cascade on user delete.

---

## 2. `catalog` — master data

Every table follows the same pattern: `id` + `slug` (URLs and the front end) + `name`, plus an active flag where it applies. Clients get `select` only; inserts come from `api/generate.ts` with `service_role`.

### `catalog.units`
What makes scaling servings and summing nutrition actually work.

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
Synonyms — "jitomate" → tomate rojo. Drives autocomplete and stops Gemini duplicating ingredients by spelling them differently. **`api/generate.ts` resolves against this table before creating a new ingredient.**

`alias_id integer identity` PK · `ingredient_id` FK cascade · `alias text` unique per ingredient · `locale text` optional.

### `catalog.ingredient_allergens`
N:N bridge. Lets a recipe's allergens be **derived from its ingredients** rather than trusted from whatever the AI declared. `search_recipes()` reads it directly.

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

---

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
| `total_minutes` | `smallint generated always as (coalesce(prep_minutes,0) + coalesce(cook_minutes,0)) stored` | The `coalesce` is load-bearing — see `CLAUDE.md` |
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
- `ix_recipes_feed` — `(status, visibility, published_at desc)` with `include` of the card columns.
- `ix_recipes_time` — the duration filter.
- `ix_recipes_author` — the profile page **and** the RLS policy, which filters on `author_id`.
- `ix_recipes_search` — GIN over `to_tsvector(title || summary)`.

> The v1 dictionary avoided `on delete cascade` on `author_id` because SQL Server rejects multiple cascade paths to the same table. **Postgres has no such restriction** — the workaround is not ported. `on delete set null` keeps AI-generated recipes alive when their author leaves.

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
| `is_optional` | `boolean` | Note: optional ingredients still count for allergen exclusion |
| `group_label` | `text` | "Para la salsa" |
| `sort_order` | `smallint` | |

### `recipe.recipe_steps`
`step_id integer identity` PK · `recipe_id uuid` FK cascade · `step_number smallint` unique per recipe · `instruction text` · `duration_minutes smallint` (feeds the front-end timer) · `image_url text`.

### `recipe.recipe_nutrition`
1:1 with the recipe, values **per serving**. `is_estimated` separates computed from declared.

`recipe_id uuid` PK/FK · `calories` · `protein_g` · `carbs_g` · `fat_g` · `fiber_g` · `sugar_g` · `sodium_mg` · `is_estimated` · `calculated_at`.

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

The reverse indexes are what stop "give me Italian recipes" from scanning the whole table. All five are read by `search_recipes()`.

---

## 4. `ai` — traceability and cost control

**Never exposed to PostgREST.** RLS enabled with **zero policies**, so only `service_role` gets through. Written only by `api/generate.ts`.

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
`result_id integer identity` PK · `request_id uuid` FK cascade · `recipe_id uuid` FK, **nullable** (there was a response but the parser failed) · `raw_response jsonb` — always stored, even on failure.

### `ai.usage_quota`
Rate limiting **persisted**, not held in process memory — Vercel Functions are stateless per invocation, so an in-memory counter is meaningless.

PK `(user_id, usage_date)` · `request_count` · `token_count`.

### Functions on `ai`

| Function | Security | Purpose |
|---|---|---|
| `ai.persist_generation(payload jsonb)` | definer | One transaction for the whole recipe tree. Sequential inserts leave partial data on failure |
| `ai.get_generation_status(p_request_id uuid)` | definer | The client's only window into `ai`. Returns status for rows owned by `auth.uid()` and nothing else |

---

## 5. `social`

### `social.ratings`
PK `(user_id, recipe_id)` — **the combination is the identity**, which gives one vote per user per recipe for free. `rating smallint check between 1 and 5`.

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
PK `(user_id, recipe_id)` + `saved_at` + `notes`. Fires the trigger that maintains `recipes.save_count`.

### `social.collections`
`collection_id uuid` PK · `user_id uuid` FK · `name text` unique per user (partial index) · `description` · `cover_image_url` · `is_public boolean` · `created_at` / `deleted_at`.

### `social.collection_recipes`
PK `(collection_id, recipe_id)` + `sort_order` for manual ordering + `added_at`.

### `social.follows`
PK `(follower_id, followee_id)` with `check (follower_id <> followee_id)`.

### `social.user_diet_preferences` / `social.user_allergen_preferences`
Preload the sidebar filters on login. Simple bridges against `catalog`.

### `social.reports`
Polymorphic moderation.

`report_id integer identity` PK · `reporter_id uuid` FK → `auth.users` · `target_type text` (`recipe` \| `comment` \| `user`) · `target_id text` **without FK — polymorphic, validated in app code** · `reason` / `details` · `status text` (`open` \| `reviewing` \| `resolved` \| `dismissed`) · `resolved_by` / `resolved_at`.

> `target_id` is `text`, not `bigint`: targets now have mixed key types (`recipes` is uuid, `comments` is integer). Cast on read.

---

## Triggers

| Trigger | Table | Security | Does |
|---|---|---|---|
| `tr_profiles_from_auth` | `auth.users` | **definer** | Creates the `app.profiles` row on signup |
| `tr_recipes_updated` | `recipe.recipes` | invoker | Refreshes `updated_at` — touches only `NEW`, its own row |
| `tr_ratings_aggregate` | `social.ratings` | **definer** | Recomputes `rating_avg`, `rating_count` on `recipe.recipes` |
| `tr_saved_aggregate` | `social.saved_recipes` | **definer** | Recomputes `save_count` on `recipe.recipes` |

The two aggregate triggers write to a table the invoking user does not own. Without `security definer` the UPDATE is filtered by the `"update own"` policy, matches zero rows, and raises no error — counters freeze silently. See `CLAUDE.md`.

## Views

**`recipe.vw_recipe_cards`** — everything a listing card needs in one query: recipe data, author, calories, and cuisines/diets concatenated with `string_agg`. Filters `deleted_at is null`. `search_recipes()` returns `setof` this view.

```sql
create view recipe.vw_recipe_cards with (security_invoker = true) as ...
```

`security_invoker` is mandatory on every view in this project.

## Functions

| Function | Schema | Security | Purpose |
|---|---|---|---|
| `has_role(check_code text)` | `app` | definer | Role check used inside policies |
| `search_recipes(...)` | `recipe` | **invoker** | The main browse/filter query |
| `count_recipes(...)` | `recipe` | invoker | Result count for pagination |
| `persist_generation(payload jsonb)` | `ai` | definer | Transactional write of a generated recipe |
| `get_generation_status(p_request_id uuid)` | `ai` | definer | Client-facing status of a generation |
