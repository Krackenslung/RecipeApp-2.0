-- recipe — the recipe and everything it owns.
--
-- recipe_id is a uuid and *is* the API-facing id: PostgREST exposes whatever the
-- client filters on, so a separate internal integer key would have bought a
-- narrow index and then leaked through the API anyway. Bridge tables keep
-- integer keys because they are never addressed individually.

create schema if not exists recipe;

grant usage on schema recipe to anon, authenticated;


-- 1. recipes ------------------------------------------------------------------

create table recipe.recipes (
  recipe_id       uuid primary key default gen_random_uuid(),
  -- Nullable, and `set null` rather than cascade: an AI-generated recipe has no
  -- author, and a recipe should outlive the account that asked for it.
  author_id       uuid references auth.users (id) on delete set null,
  title           text not null,
  slug            text not null,
  summary         text,
  servings        smallint not null check (servings between 1 and 100),
  prep_minutes    smallint check (prep_minutes >= 0),
  cook_minutes    smallint check (cook_minutes >= 0),
  -- The coalesce is load-bearing. Without it a null half makes the whole column
  -- null, and every recipe missing one of the two silently drops out of the
  -- time filter instead of matching it.
  total_minutes   smallint generated always as
                    ((coalesce(prep_minutes, 0) + coalesce(cook_minutes, 0))::smallint) stored,
  difficulty      smallint check (difficulty between 1 and 3),
  est_cost        numeric(10,2) check (est_cost >= 0),
  currency        text not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  cover_image_url text,
  source_type     text not null default 'user' check (source_type in ('ai', 'user', 'imported')),
  source_url      text,
  status          text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility      text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  language        text,
  rating_avg      numeric(3,2) check (rating_avg between 0 and 5),
  rating_count    integer not null default 0,
  save_count      integer not null default 0,
  view_count      integer not null default 0,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on column recipe.recipes.rating_avg is
  'Denormalized, maintained by tr_ratings_aggregate. Never written from the client.';

create unique index ux_recipes_slug on recipe.recipes (slug) where deleted_at is null;

-- The feed never touches the base table: everything the card needs rides along
-- in the index.
create index ix_recipes_feed
  on recipe.recipes (status, visibility, published_at desc)
  include (recipe_id, slug, title, summary, cover_image_url, total_minutes, rating_avg)
  where deleted_at is null;

create index ix_recipes_time on recipe.recipes (total_minutes) where deleted_at is null;

-- The profile page AND the RLS policy below, which filters on author_id. A
-- policy on an unindexed column turns every query into a sequential scan.
create index ix_recipes_author on recipe.recipes (author_id) where deleted_at is null;

create trigger tr_recipes_updated
  before update on recipe.recipes
  for each row execute function app.touch_updated_at();

alter table recipe.recipes enable row level security;

create policy "read published or own"
  on recipe.recipes for select
  using (
    deleted_at is null
    and (
      (status = 'published' and visibility in ('public', 'unlisted'))
      or author_id = (select auth.uid())
    )
  );

create policy "insert own"
  on recipe.recipes for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "update own"
  on recipe.recipes for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "delete own"
  on recipe.recipes for delete to authenticated
  using (author_id = (select auth.uid()));

grant select on recipe.recipes to anon, authenticated;
grant insert, update, delete on recipe.recipes to authenticated;


-- 2. the children -------------------------------------------------------------
--
-- Each one inherits its visibility from the parent recipe. Expressing that as
-- `exists (select 1 from recipe.recipes ...)` means the parent's own policy is
-- what decides, so there is exactly one place where "who may see this recipe" is
-- defined, and the children cannot drift from it.

create table recipe.recipe_ingredients (
  recipe_ingredient_id integer generated always as identity primary key,
  recipe_id     uuid    not null references recipe.recipes (recipe_id) on delete cascade,
  -- Nullable: if Gemini returns something uncatalogued the recipe still saves,
  -- with raw_text carrying what it said.
  ingredient_id integer references catalog.ingredients (ingredient_id),
  raw_text      text    not null,
  quantity      numeric(10,3) check (quantity > 0),
  unit_id       smallint references catalog.units (unit_id),
  preparation   text,
  is_optional   boolean not null default false,
  group_label   text,
  sort_order    smallint not null default 0
);

create index ix_recipe_ingredients_recipe on recipe.recipe_ingredients (recipe_id);

create table recipe.recipe_steps (
  step_id          integer generated always as identity primary key,
  recipe_id        uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  step_number      smallint not null,
  instruction      text     not null,
  duration_minutes smallint,
  image_url        text,

  constraint ux_step_number unique (recipe_id, step_number)
);

create table recipe.recipe_nutrition (
  recipe_id     uuid primary key references recipe.recipes (recipe_id) on delete cascade,
  calories      numeric(8,2),
  protein_g     numeric(8,2),
  carbs_g       numeric(8,2),
  fat_g         numeric(8,2),
  fiber_g       numeric(8,2),
  sugar_g       numeric(8,2),
  sodium_mg     numeric(8,2),
  is_estimated  boolean not null default true,
  calculated_at timestamptz default now()
);

comment on table recipe.recipe_nutrition is
  'Values are per serving, not per recipe. is_estimated separates computed from declared.';

create table recipe.recipe_images (
  image_id   integer generated always as identity primary key,
  recipe_id  uuid not null references recipe.recipes (recipe_id) on delete cascade,
  url        text not null,
  alt_text   text,
  aspect     text,
  sort_order smallint not null default 0
);

create index ix_recipe_images_recipe on recipe.recipe_images (recipe_id);


-- 3. the filter bridges -------------------------------------------------------
-- The reverse index on each is what stops "give me Italian recipes" scanning
-- the whole table. All five are read by search_recipes().

create table recipe.recipe_cuisines (
  recipe_id  uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  cuisine_id smallint not null references catalog.cuisines (cuisine_id) on delete cascade,
  primary key (recipe_id, cuisine_id)
);
create index ix_rc_cuisine on recipe.recipe_cuisines (cuisine_id);

create table recipe.recipe_diets (
  recipe_id uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  diet_id   smallint not null references catalog.diets (diet_id) on delete cascade,
  primary key (recipe_id, diet_id)
);
create index ix_rd_diet on recipe.recipe_diets (diet_id);

create table recipe.recipe_tags (
  recipe_id uuid    not null references recipe.recipes (recipe_id) on delete cascade,
  tag_id    integer not null references catalog.tags (tag_id) on delete cascade,
  primary key (recipe_id, tag_id)
);
create index ix_rt_tag on recipe.recipe_tags (tag_id);

create table recipe.recipe_meal_types (
  recipe_id    uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  meal_type_id smallint not null references catalog.meal_types (meal_type_id) on delete cascade,
  primary key (recipe_id, meal_type_id)
);
create index ix_rmt_meal on recipe.recipe_meal_types (meal_type_id);

create table recipe.recipe_equipment (
  recipe_id    uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  equipment_id smallint not null references catalog.equipment (equipment_id) on delete cascade,
  primary key (recipe_id, equipment_id)
);
create index ix_re_equip on recipe.recipe_equipment (equipment_id);


-- 4. RLS on the children ------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'recipe_ingredients', 'recipe_steps', 'recipe_nutrition', 'recipe_images',
    'recipe_cuisines', 'recipe_diets', 'recipe_tags', 'recipe_meal_types',
    'recipe_equipment'
  ]
  loop
    execute format('alter table recipe.%I enable row level security', t);

    -- Visible exactly when the parent recipe is. The subquery is filtered by
    -- the parent's own select policy, so this never needs restating.
    execute format($p$
      create policy "visible with the recipe" on recipe.%I for select
      using (exists (select 1 from recipe.recipes r where r.recipe_id = %I.recipe_id))
    $p$, t, t);

    execute format($p$
      create policy "write with own recipe" on recipe.%I for insert to authenticated
      with check (exists (
        select 1 from recipe.recipes r
         where r.recipe_id = %I.recipe_id and r.author_id = (select auth.uid())))
    $p$, t, t);

    execute format($p$
      create policy "update with own recipe" on recipe.%I for update to authenticated
      using (exists (
        select 1 from recipe.recipes r
         where r.recipe_id = %I.recipe_id and r.author_id = (select auth.uid())))
    $p$, t, t);

    execute format($p$
      create policy "delete with own recipe" on recipe.%I for delete to authenticated
      using (exists (
        select 1 from recipe.recipes r
         where r.recipe_id = %I.recipe_id and r.author_id = (select auth.uid())))
    $p$, t, t);

    execute format('grant select on recipe.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on recipe.%I to authenticated', t);
  end loop;
end $$;


-- 5. vw_recipe_cards ----------------------------------------------------------
--
-- Everything a listing card needs in one query. search_recipes() returns
-- `setof` this view, so its column list is a contract with the frontend.
--
-- security_invoker is mandatory. A view runs with its OWNER's privileges by
-- default, which would hand every row of every private recipe to anyone who
-- selected from it — the single easiest way to publish the whole database.

create view recipe.vw_recipe_cards
with (security_invoker = true) as
select
  r.recipe_id,
  r.slug,
  r.title,
  r.summary,
  r.cover_image_url,
  r.servings,
  r.total_minutes,
  r.difficulty,
  r.est_cost,
  r.currency,
  r.status,
  r.visibility,
  r.rating_avg,
  r.rating_count,
  r.save_count,
  r.published_at,
  r.author_id,
  p.username      as author_username,
  p.display_name  as author_display_name,
  p.avatar_url    as author_avatar_url,
  n.calories,
  (select string_agg(c.name, ', ' order by c.name)
     from recipe.recipe_cuisines rc
     join catalog.cuisines c on c.cuisine_id = rc.cuisine_id
    where rc.recipe_id = r.recipe_id) as cuisines,
  (select string_agg(d.name, ', ' order by d.name)
     from recipe.recipe_diets rd
     join catalog.diets d on d.diet_id = rd.diet_id
    where rd.recipe_id = r.recipe_id) as diets
from recipe.recipes r
left join app.profiles p        on p.id = r.author_id
left join recipe.recipe_nutrition n on n.recipe_id = r.recipe_id
where r.deleted_at is null;

grant select on recipe.vw_recipe_cards to anon, authenticated;


-- 6. view_count ---------------------------------------------------------------
-- "Incremented by the app", but the update policy only lets an author touch
-- their own recipe — so a reader incrementing a counter needs a definer
-- function. Scoped to one column so it cannot be used to write anything else.

create or replace function recipe.increment_view_count(p_recipe_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update recipe.recipes
     set view_count = view_count + 1
   where recipe_id = p_recipe_id
     and deleted_at is null
     and status = 'published'
     and visibility in ('public', 'unlisted');
$$;

grant execute on function recipe.increment_view_count to anon, authenticated;
