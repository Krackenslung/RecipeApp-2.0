# Recipe_app — Data dictionary

Engine: **Microsoft SQL Server 2019+**
DDL file: `recipe_app_schema.sql`

## Conventions

| Rule | Decision |
|---|---|
| Primary key | Internal `INT IDENTITY` (narrow indexes, fast joins) |
| Public ID | `UNIQUEIDENTIFIER` on API-exposed tables — doesn't leak row counts |
| Text | `NVARCHAR` (multi-language recipes) |
| Dates | `DATETIME2(3)` in UTC via `SYSUTCDATETIME()` |
| Deletion | Soft (`deleted_at`) on content tables; hard on bridge tables |
| Uniqueness with soft delete | Filtered unique index `WHERE deleted_at IS NULL` |
| Booleans | `BIT` with an explicit `DEFAULT` |
| Money | `DECIMAL(10,2)` + a `currency` column |

## Schemas

| Schema | Contents | Tables |
|---|---|---|
| `auth` | Identity, sessions, permissions | 6 |
| `catalog` | Master data feeding the filters | 9 |
| `recipe` | The recipe and everything belonging to it | 10 |
| `ai` | Gemini traceability and cost control | 3 |
| `social` | Interaction between users | 9 |

---

## 1. `auth` schema

### `auth.users`
User account. Supports local login (`password_hash`) and OAuth (`password_hash` null).

| Column | Type | Notes |
|---|---|---|
| `user_id` | `INT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | ID exposed in the API |
| `email` | `NVARCHAR(320)` | Real maximum length of an email address |
| `email_normalized` | computed `PERSISTED` | `LOWER(email)`; the unique index goes on this |
| `email_verified_at` | `DATETIME2(3)` | NULL = unverified |
| `password_hash` | `VARCHAR(255)` | bcrypt. NULL if they sign in through an external provider |
| `username` | `NVARCHAR(40)` | Unique among active rows |
| `display_name` | `NVARCHAR(80)` | Visible name |
| `avatar_url` | `NVARCHAR(500)` | |
| `bio` | `NVARCHAR(500)` | |
| `locale` | `VARCHAR(10)` | Default `es-MX` |
| `is_active` | `BIT` | Administrative suspension |
| `failed_logins` | `SMALLINT` | Counter for brute-force lockout |
| `locked_until` | `DATETIME2(3)` | Temporary lockout |
| `last_login_at` | `DATETIME2(3)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | |

Indexes: `UX_users_email` and `UX_users_username` (filtered), `UX_users_public`.

### `auth.roles`
Fixed catalog: `1 user`, `2 moderator`, `3 admin`.

| Column | Type | Notes |
|---|---|---|
| `role_id` | `TINYINT` | PK, explicit values (not IDENTITY) |
| `code` | `VARCHAR(20)` | Unique; this is what the middleware checks |
| `display_name` | `NVARCHAR(50)` | |

### `auth.user_roles`
N:N bridge. Composite PK `(user_id, role_id)`. Cascades on user deletion.

### `auth.user_identities`
Federated login (Google, GitHub, Apple).

| Column | Type | Notes |
|---|---|---|
| `identity_id` | `INT IDENTITY` | PK |
| `user_id` | `INT` | FK → `users`, cascade |
| `provider` | `VARCHAR(30)` | |
| `provider_user_id` | `NVARCHAR(255)` | Unique together with `provider` |

### `auth.sessions`
Live refresh tokens. **Never stores the token in the clear.**

| Column | Type | Notes |
|---|---|---|
| `session_id` | `BIGINT IDENTITY` | PK |
| `user_id` | `INT` | FK → `users`, cascade |
| `token_hash` | `BINARY(32)` | SHA-256 of the refresh token. Unique |
| `user_agent` | `NVARCHAR(300)` | For the "active sessions" screen |
| `ip_address` | `VARCHAR(45)` | Fits IPv6 |
| `issued_at` / `expires_at` / `revoked_at` | `DATETIME2(3)` | Revoking means writing `revoked_at`, not deleting |

### `auth.one_time_tokens`
Email verification and password reset in a single table, discriminated by `purpose`
(`email_verify` \| `password_reset`). Also stores only the hash. `consumed_at` prevents reuse.

---

## 2. `catalog` schema

Every table in this schema follows the same pattern: `id` + `slug` (for URLs and for the front end)
+ `name` + an active flag where it applies.

### `catalog.units`
The table that makes it possible to scale servings and add up nutrition for real.

| Column | Type | Notes |
|---|---|---|
| `unit_id` | `SMALLINT IDENTITY` | PK |
| `code` | `VARCHAR(20)` | `g`, `ml`, `tbsp`, `cup`, `pza` |
| `dimension` | `VARCHAR(10)` | `mass` \| `volume` \| `count` |
| `to_base_factor` | `DECIMAL(18,6)` | Equivalent in g or ml. NULL when it is `count` |
| `system` | `VARCHAR(10)` | `metric` \| `imperial` |

Seed: 11 units.

### `catalog.ingredients`

| Column | Type | Notes |
|---|---|---|
| `ingredient_id` | `INT IDENTITY` | PK |
| `slug` | `VARCHAR(100)` | Unique |
| `name` | `NVARCHAR(120)` | |
| `category_id` | `SMALLINT` | FK → `ingredient_categories` |
| `default_unit_id` | `SMALLINT` | FK → `units` |
| `kcal_per_100`, `protein_per_100`, `carbs_per_100`, `fat_per_100` | `DECIMAL(8,2)` | Basis for computing recipe nutrition |
| `avg_cost_per_100` | `DECIMAL(10,2)` | Basis for the cost filter |
| `is_verified` | `BIT` | Tells curated data apart from what arrived via AI |

### `catalog.ingredient_aliases`
Synonyms: "jitomate" → red tomato. Drives the autocomplete and keeps Gemini from duplicating
ingredients just because it spelled them differently.

| Column | Type | Notes |
|---|---|---|
| `alias_id` | `INT IDENTITY` | PK |
| `ingredient_id` | `INT` | FK, cascade |
| `alias` | `NVARCHAR(120)` | Unique per ingredient |
| `locale` | `VARCHAR(10)` | Optional |

### Simple catalogs

| Table | PK | Fields | Initial seed |
|---|---|---|---|
| `catalog.cuisines` | `SMALLINT` | `slug`, `name`, `region`, `icon`, `is_active` | 10 cuisines |
| `catalog.diets` | `SMALLINT` | `slug`, `name`, `description`, `is_active` | 9 diets |
| `catalog.allergens` | `SMALLINT` | `slug`, `name` | 9 allergens |
| `catalog.meal_types` | `SMALLINT` | `slug`, `name`, `sort_order` | 6 meal types |
| `catalog.equipment` | `SMALLINT` | `slug`, `name` | 7 items |
| `catalog.ingredient_categories` | `SMALLINT` | `slug`, `name` | 8 categories |
| `catalog.tags` | `INT` | `slug`, `name`, `usage_count` | — |

### `catalog.ingredient_allergens`
N:N bridge. Lets a recipe's allergens be derived from its ingredients rather than trusting the AI
to declare them.

---

## 3. `recipe` schema

### `recipe.recipes`
The central table.

| Column | Type | Notes |
|---|---|---|
| `recipe_id` | `INT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | API ID |
| `author_id` | `INT` | FK → `users`. **Nullable** = system-generated |
| `title` | `NVARCHAR(160)` | |
| `slug` | `VARCHAR(180)` | Unique among non-deleted rows |
| `summary` | `NVARCHAR(600)` | Card copy |
| `servings` | `SMALLINT` | CHECK 1–100 |
| `prep_minutes` / `cook_minutes` | `SMALLINT` | |
| `total_minutes` | computed `PERSISTED` | Sum of the two. Indexable; feeds the time filter |
| `difficulty` | `TINYINT` | CHECK 1–3 |
| `est_cost` | `DECIMAL(10,2)` | Estimated total cost |
| `currency` | `CHAR(3)` | Default `MXN` |
| `cover_image_url` | `NVARCHAR(500)` | |
| `source_type` | `VARCHAR(20)` | `ai` \| `user` \| `imported` |
| `source_url` | `NVARCHAR(500)` | If it was imported |
| `status` | `VARCHAR(20)` | `draft` \| `published` \| `archived` |
| `visibility` | `VARCHAR(20)` | `private` \| `unlisted` \| `public` |
| `language` | `VARCHAR(10)` | |
| `rating_avg` | `DECIMAL(3,2)` | **Denormalized**, maintained by trigger |
| `rating_count` | `INT` | **Denormalized**, trigger |
| `save_count` | `INT` | **Denormalized**, trigger |
| `view_count` | `INT` | Incremented by the app |
| `published_at` | `DATETIME2(3)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | |

Key indexes:
- `IX_recipes_feed` — `(status, visibility, published_at DESC)` with an `INCLUDE` of the card
  columns. Covers the main listing without touching the base table.
- `IX_recipes_time` — duration filter.
- `IX_recipes_author` — user profile.

> **Note on FKs:** `author_id` deliberately has no `ON DELETE CASCADE`. SQL Server rejects multiple
> cascade paths into the same table and would fail to create `collection_recipes`. User deletion is
> handled as a soft delete from the application.

### `recipe.recipe_ingredients`

| Column | Type | Notes |
|---|---|---|
| `recipe_ingredient_id` | `INT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascade |
| `ingredient_id` | `INT` | FK. **Nullable**: if Gemini returns something uncatalogued, the recipe is still saved |
| `raw_text` | `NVARCHAR(200)` | Original text, always kept |
| `quantity` | `DECIMAL(10,3)` | CHECK > 0 |
| `unit_id` | `SMALLINT` | FK → `units` |
| `preparation` | `NVARCHAR(120)` | "finely chopped" |
| `is_optional` | `BIT` | |
| `group_label` | `NVARCHAR(60)` | "For the sauce" |
| `sort_order` | `SMALLINT` | |

### `recipe.recipe_steps`

| Column | Type | Notes |
|---|---|---|
| `step_id` | `INT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascade |
| `step_number` | `SMALLINT` | Unique per recipe |
| `instruction` | `NVARCHAR(1500)` | |
| `duration_minutes` | `SMALLINT` | Feeds the front-end timer |
| `image_url` | `NVARCHAR(500)` | |

### `recipe.recipe_nutrition`
1:1 with the recipe, values **per serving**. `is_estimated` tells computed values apart from
declared ones.

Columns: `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`,
`is_estimated`, `calculated_at`.

### `recipe.recipe_images`
Gallery. `url`, `alt_text`, `aspect`, `sort_order`.

### Filter bridge tables

| Table | Composite PK | Reverse index |
|---|---|---|
| `recipe.recipe_cuisines` | `(recipe_id, cuisine_id)` | `IX_rc_cuisine` |
| `recipe.recipe_diets` | `(recipe_id, diet_id)` | `IX_rd_diet` |
| `recipe.recipe_tags` | `(recipe_id, tag_id)` | `IX_rt_tag` |
| `recipe.recipe_meal_types` | `(recipe_id, meal_type_id)` | — |
| `recipe.recipe_equipment` | `(recipe_id, equipment_id)` | — |

The reverse indexes are what keep "give me Italian recipes" from scanning the whole table.

---

## 4. `ai` schema

### `ai.generation_requests`
One row per call to Gemini. Without this you don't know what each generation costs you or why they
fail.

| Column | Type | Notes |
|---|---|---|
| `request_id` | `BIGINT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | So the front end can poll the status |
| `user_id` | `INT` | FK → `users` |
| `prompt` | `NVARCHAR(MAX)` | |
| `filters_json` | `NVARCHAR(MAX)` | Exact snapshot of the sidebar. CHECK `ISJSON = 1` |
| `model` | `VARCHAR(60)` | For comparing versions |
| `status` | `VARCHAR(20)` | `pending` \| `success` \| `failed` \| `filtered` |
| `tokens_input` / `tokens_output` | `INT` | Real cost |
| `latency_ms` | `INT` | |
| `error_message` | `NVARCHAR(1000)` | |
| `created_at` / `completed_at` | `DATETIME2(3)` | |

### `ai.generation_results`
Raw response plus persisted recipe.

| Column | Type | Notes |
|---|---|---|
| `result_id` | `BIGINT IDENTITY` | PK |
| `request_id` | `BIGINT` | FK, cascade |
| `recipe_id` | `INT` | FK. Nullable: there was a response but the parser failed |
| `raw_response` | `NVARCHAR(MAX)` | Original JSON, for debugging |

### `ai.usage_quota`
Persisted rate limiting, not just in process memory.

Composite PK `(user_id, usage_date)`. Fields: `request_count`, `token_count`.

---

## 5. `social` schema

### `social.ratings`
Composite PK `(user_id, recipe_id)` — **the combination is the identity**, which gets you one vote
per user per recipe for free. `rating` with CHECK 1–5.

### `social.comments`

| Column | Type | Notes |
|---|---|---|
| `comment_id` | `BIGINT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascade |
| `user_id` | `INT` | FK without cascade (avoids multiple paths) |
| `parent_id` | `BIGINT` | Self-reference, one level of threading |
| `body` | `NVARCHAR(2000)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | Soft delete preserves the thread |

### `social.saved_recipes`
PK `(user_id, recipe_id)` + `saved_at` + `notes`. Fires the trigger that updates
`recipes.save_count`.

### `social.collections` and `social.collection_recipes`
Collections with `public_id`, `is_public` and a name unique per user (filtered index). The bridge
table carries `sort_order` for manual ordering.

### `social.follows`
PK `(follower_id, followee_id)` with CHECK `follower_id <> followee_id`.

### `social.user_diet_preferences` and `social.user_allergen_preferences`
Pre-fill the sidebar filters when the user signs in. Simple bridges against `catalog`.

### `social.reports`
Polymorphic moderation.

| Column | Type | Notes |
|---|---|---|
| `report_id` | `BIGINT IDENTITY` | PK |
| `reporter_id` | `INT` | FK → `users` |
| `target_type` | `VARCHAR(20)` | `recipe` \| `comment` \| `user` |
| `target_id` | `BIGINT` | No FK — it's polymorphic, validated in the app |
| `reason` / `details` | | |
| `status` | `VARCHAR(20)` | `open` \| `reviewing` \| `resolved` \| `dismissed` |
| `resolved_by` / `resolved_at` | | |

---

## 6. Triggers

| Trigger | Table | What it does |
|---|---|---|
| `TR_recipes_updated` | `recipe.recipes` | Refreshes `updated_at` when the UPDATE doesn't carry it |
| `TR_ratings_aggregate` | `social.ratings` | Recomputes `rating_avg` and `rating_count` |
| `TR_saved_aggregate` | `social.saved_recipes` | Recomputes `save_count` |

All three are written set-based (`inserted` UNION `deleted`), not row by row.

## 7. Views

**`recipe.vw_recipe_cards`** — everything a listing card needs in a single query: recipe data,
author, calories, and the cuisines/diets concatenated with `STRING_AGG`. It already filters
`deleted_at IS NULL`.

---

## Open decisions

1. **Reviews vs ratings.** Right now `ratings` (numeric) and `comments` (text) are independent. If
   you want Amazon-style reviews, they have to be merged into a single table.
2. **Total cost or per serving.** `est_cost` stores the total; the sidebar filter would have to
   divide by `servings` if you prefer unit cost.
3. **Multi-language.** Today there is only the `language` column on the recipe. Real translation
   requires `*_translations` tables for recipes, steps and ingredients.
