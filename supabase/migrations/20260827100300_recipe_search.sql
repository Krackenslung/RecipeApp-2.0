-- The main browse screen. Cannot be expressed through PostgREST query chaining:
-- "has ALL of these ingredients" needs a HAVING count(distinct ...) = n, and
-- embedded filters only give "has at least one of".
--
-- SECURITY INVOKER (the default — do NOT add security definer). It reads through
-- vw_recipe_cards, which is itself security_invoker, so RLS on the base tables
-- still applies and this function cannot leak a private recipe.

-- 1. Indexes the predicates depend on -----------------------------------------

create index if not exists ix_ri_ingredient
  on recipe.recipe_ingredients (ingredient_id, recipe_id)
  where ingredient_id is not null;

create index if not exists ix_ia_ingredient
  on catalog.ingredient_allergens (ingredient_id, allergen_id);

-- Free-text search over title + summary
create index if not exists ix_recipes_search
  on recipe.recipes
  using gin (to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(summary,'')))
  where deleted_at is null;


-- 2. The function --------------------------------------------------------------

create or replace function recipe.search_recipes(
  p_include_ingredients  integer[]  default '{}',
  p_exclude_ingredients  integer[]  default '{}',
  p_cuisines             smallint[] default '{}',
  p_diets                smallint[] default '{}',
  p_meal_types           smallint[] default '{}',
  p_exclude_allergens    smallint[] default '{}',
  p_equipment            smallint[] default '{}',
  p_max_minutes          integer    default null,
  p_max_cost             numeric    default null,
  p_cost_per_serving     boolean    default false,
  p_max_calories         numeric    default null,
  p_max_difficulty       smallint   default null,
  p_min_servings         smallint   default null,
  p_max_servings         smallint   default null,
  p_min_rating           numeric    default null,
  p_search               text       default null,
  p_sort                 text       default 'recent',
  p_limit                integer    default 20,
  p_offset               integer    default 0,
  -- Not part of the sidebar: the screen sets it. /me passes the signed-in user,
  -- the feed passes nothing. Added last so existing positional calls still line
  -- up, though PostgREST always calls by name.
  p_author_id            uuid       default null
)
returns setof recipe.vw_recipe_cards
language sql
stable
as $$
  select c.*
  from recipe.vw_recipe_cards c
  where
    -- Author: the /me screen. RLS already limits this to what the caller may
    -- see, so passing someone else's id returns their public recipes, not all.
    (p_author_id is null or c.author_id = p_author_id)

    -- Cuisines: ANY of the selected (a recipe is rarely two cuisines at once)
    and (cardinality(p_cuisines) = 0 or exists (
        select 1 from recipe.recipe_cuisines rc
         where rc.recipe_id = c.recipe_id
           and rc.cuisine_id = any (p_cuisines)))

    -- Meal types: ANY
    and (cardinality(p_meal_types) = 0 or exists (
        select 1 from recipe.recipe_meal_types rm
         where rm.recipe_id = c.recipe_id
           and rm.meal_type_id = any (p_meal_types)))

    -- Equipment: ALL — you either own the air fryer or you don't
    and (cardinality(p_equipment) = 0 or (
        select count(distinct re.equipment_id)
          from recipe.recipe_equipment re
         where re.recipe_id = c.recipe_id
           and re.equipment_id = any (p_equipment)) = cardinality(p_equipment))

    -- Diets: ALL — "vegan AND gluten-free" must satisfy both
    and (cardinality(p_diets) = 0 or (
        select count(distinct rd.diet_id)
          from recipe.recipe_diets rd
         where rd.recipe_id = c.recipe_id
           and rd.diet_id = any (p_diets)) = cardinality(p_diets))

    -- Include ingredients: ALL
    and (cardinality(p_include_ingredients) = 0 or (
        select count(distinct ri.ingredient_id)
          from recipe.recipe_ingredients ri
         where ri.recipe_id = c.recipe_id
           and ri.ingredient_id = any (p_include_ingredients))
        = cardinality(p_include_ingredients))

    -- Exclude ingredients: NONE
    and not exists (
        select 1 from recipe.recipe_ingredients ri
         where ri.recipe_id = c.recipe_id
           and ri.ingredient_id = any (p_exclude_ingredients))

    -- Allergens: DERIVED from the ingredients, not trusted from the AI.
    -- Optional ingredients still count — an allergy is not a preference.
    and not exists (
        select 1
          from recipe.recipe_ingredients ri
          join catalog.ingredient_allergens ia on ia.ingredient_id = ri.ingredient_id
         where ri.recipe_id = c.recipe_id
           and ia.allergen_id = any (p_exclude_allergens))

    -- Scalar filters. NULL means "no constraint".
    and (p_max_minutes    is null or c.total_minutes <= p_max_minutes)
    and (p_max_difficulty is null or c.difficulty    <= p_max_difficulty)
    and (p_min_servings   is null or c.servings      >= p_min_servings)
    and (p_max_servings   is null or c.servings      <= p_max_servings)
    and (p_max_calories   is null or c.calories      <= p_max_calories)
    and (p_min_rating     is null or c.rating_avg    >= p_min_rating)
    and (p_max_cost       is null or
         case when p_cost_per_serving
              then c.est_cost / nullif(c.servings, 0)
              else c.est_cost
         end <= p_max_cost)

    -- Free text
    and (p_search is null or p_search = '' or
         to_tsvector('spanish', coalesce(c.title,'') || ' ' || coalesce(c.summary,''))
         @@ plainto_tsquery('spanish', p_search))

  order by
    case when p_sort = 'rating'  then c.rating_avg    end desc nulls last,
    case when p_sort = 'quick'   then c.total_minutes end asc  nulls last,
    case when p_sort = 'cheap'   then c.est_cost      end asc  nulls last,
    case when p_sort = 'popular' then c.save_count    end desc nulls last,
    c.published_at desc nulls last,
    c.recipe_id desc
  limit  least(coalesce(p_limit, 20), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function recipe.search_recipes is
  'Main browse/filter query. Empty array = no constraint on that dimension, never "match nothing". Allergens are derived from catalog.ingredient_allergens. security invoker by design: RLS on the base tables is what limits visibility.';

grant execute on function recipe.search_recipes to anon, authenticated;


-- 3. Companion: total count for pagination -------------------------------------
-- PostgREST cannot return a count from an RPC alongside the rows, so the UI
-- either calls this or uses infinite scroll. Prefer infinite scroll.

create or replace function recipe.count_recipes(
  p_include_ingredients integer[]  default '{}',
  p_exclude_ingredients integer[]  default '{}',
  p_cuisines            smallint[] default '{}',
  p_diets               smallint[] default '{}',
  p_max_minutes         integer    default null
)
returns bigint
language sql
stable
as $$
  select count(*) from recipe.search_recipes(
    p_include_ingredients => p_include_ingredients,
    p_exclude_ingredients => p_exclude_ingredients,
    p_cuisines            => p_cuisines,
    p_diets               => p_diets,
    p_max_minutes         => p_max_minutes,
    p_limit               => 50,
    p_offset              => 0
  );
$$;

grant execute on function recipe.count_recipes to anon, authenticated;
