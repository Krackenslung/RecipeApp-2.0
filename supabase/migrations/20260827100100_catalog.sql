-- catalog — master data feeding the filters.
--
-- Eleven tables, all the same shape: id + slug (URLs and the front end) + name,
-- plus an active flag where it applies. Clients get select and nothing else;
-- rows are written by api/generate.ts with service_role, which bypasses RLS and
-- so needs no policy of its own.
--
-- The seed lives in supabase/seed.sql and is replayed by `supabase db reset`.

create schema if not exists catalog;

grant usage on schema catalog to anon, authenticated;


-- 1. units --------------------------------------------------------------------
-- The table that makes scaling servings and summing nutrition actually work:
-- without a base factor, "2 tbsp" and "30 ml" cannot be added together.

create table catalog.units (
  unit_id        smallint generated always as identity primary key,
  code           text not null unique,
  name           text,
  dimension      text not null check (dimension in ('mass', 'volume', 'count')),
  to_base_factor numeric(18,6),
  system         text check (system in ('metric', 'imperial')),

  -- A count has nothing to convert to; mass and volume must convert to g or ml.
  constraint ck_units_factor check (
    (dimension = 'count' and to_base_factor is null)
    or (dimension <> 'count' and to_base_factor is not null and to_base_factor > 0)
  )
);


-- 2. ingredient categories ----------------------------------------------------

create table catalog.ingredient_categories (
  category_id smallint generated always as identity primary key,
  slug        text not null unique,
  name        text not null
);


-- 3. ingredients --------------------------------------------------------------

create table catalog.ingredients (
  ingredient_id    integer generated always as identity primary key,
  slug             text not null unique,
  name             text not null,
  category_id      smallint references catalog.ingredient_categories (category_id),
  default_unit_id  smallint references catalog.units (unit_id),
  kcal_per_100     numeric(8,2),
  protein_per_100  numeric(8,2),
  carbs_per_100    numeric(8,2),
  fat_per_100      numeric(8,2),
  avg_cost_per_100 numeric(10,2),
  is_verified      boolean not null default false
);

comment on column catalog.ingredients.is_verified is
  'Separates curated rows from whatever arrived through a Gemini generation.';

-- Autocomplete matches on a prefix of the name, case-insensitively.
create index ix_ingredients_name on catalog.ingredients (lower(name) text_pattern_ops);


-- 4. ingredient aliases -------------------------------------------------------
-- "jitomate" -> tomate rojo. Drives autocomplete, and stops Gemini creating a
-- second ingredient row every time it spells one differently.

create table catalog.ingredient_aliases (
  alias_id      integer generated always as identity primary key,
  ingredient_id integer not null references catalog.ingredients (ingredient_id) on delete cascade,
  alias         text not null,
  locale        text,

  constraint ux_alias_per_ingredient unique (ingredient_id, alias)
);

create index ix_aliases_alias on catalog.ingredient_aliases (lower(alias) text_pattern_ops);


-- 5. allergens and the ingredient bridge --------------------------------------

create table catalog.allergens (
  allergen_id smallint generated always as identity primary key,
  slug        text not null unique,
  name        text not null
);

-- Lets a recipe's allergens be DERIVED from its ingredients rather than trusted
-- from whatever the model declared. search_recipes() reads this directly.
create table catalog.ingredient_allergens (
  ingredient_id integer  not null references catalog.ingredients (ingredient_id) on delete cascade,
  allergen_id   smallint not null references catalog.allergens (allergen_id) on delete cascade,
  primary key (ingredient_id, allergen_id)
);


-- 6. the simple catalogs ------------------------------------------------------

create table catalog.cuisines (
  cuisine_id smallint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  region     text,
  icon       text,
  is_active  boolean not null default true
);

create table catalog.diets (
  diet_id     smallint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true
);

create table catalog.meal_types (
  meal_type_id smallint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  sort_order   smallint not null default 0
);

create table catalog.equipment (
  equipment_id smallint generated always as identity primary key,
  slug         text not null unique,
  name         text not null
);

create table catalog.tags (
  tag_id      integer generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  usage_count integer not null default 0
);


-- 7. RLS ----------------------------------------------------------------------
-- Read-only to every client. No insert, update or delete policy exists on any
-- catalog table, which is what makes them read-only: with RLS enabled and no
-- policy for an operation, that operation matches nothing.

do $$
declare t text;
begin
  foreach t in array array[
    'units', 'ingredient_categories', 'ingredients', 'ingredient_aliases',
    'allergens', 'ingredient_allergens', 'cuisines', 'diets', 'meal_types',
    'equipment', 'tags'
  ]
  loop
    execute format('alter table catalog.%I enable row level security', t);
    execute format(
      'create policy "catalog is readable" on catalog.%I for select using (true)', t);
    execute format('grant select on catalog.%I to anon, authenticated', t);
  end loop;
end $$;

-- Future tables in this schema inherit the read grant; they still need their own
-- RLS policy, which the loop above does not cover retroactively.
alter default privileges in schema catalog grant select on tables to anon, authenticated;
