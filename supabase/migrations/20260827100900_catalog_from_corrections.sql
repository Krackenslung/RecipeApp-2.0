-- Free-text ingredients become catalog rows.
--
-- api/generate.ts sends the ingredients the user typed by hand under
-- payload -> 'corrected_ingredients', as [{original, corrected}, ...], with the
-- model having fixed the spelling and normalised to English singular. Until now
-- that list arrived and was ignored, so a typed ingredient never entered the
-- catalog and the next generation had to be told about it again. This restores
-- the 1.0 behaviour (verifyCatalog in recipe.controller.js), server-side.
--
-- ── Before running this ───────────────────────────────────────────────────────
-- Confirm there is exactly ONE persist_generation and that it takes two
-- arguments, or CREATE OR REPLACE will add an overload instead of replacing:
--
--   select p.oid::regprocedure
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'ai' and p.proname = 'persist_generation';
--
-- Expected, and nothing else:
--   ai.persist_generation(jsonb,uuid)
--
-- ── What changed, relative to 20260827100800 ─────────────────────────────────
--   1. A new block resolves and inserts corrected_ingredients.
--   2. It runs BEFORE the recipe's own ingredient loop, so a just-created row
--      is available to resolve against and the generated recipe links to it
--      instead of leaving ingredient_id null.
-- Everything else is byte-identical to that migration.
--
-- Nothing else in the database gains write access to catalog.ingredients: this
-- is security definer, and `authenticated` still holds select only.

create or replace function ai.persist_generation(payload jsonb, p_author_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_recipe    jsonb := payload -> 'recipe';
  v_status    text  := coalesce(v_recipe ->> 'status', 'published');
  v_visibility text := coalesce(v_recipe ->> 'visibility', 'public');
  item        jsonb;
  v_ingredient_id integer;
  v_unit_id       smallint;
  -- corrected_ingredients
  v_name      text;
  v_original  text;
  v_slug      text;
  v_made      integer := 0;
begin
  ---------------------------------------------------------------------------
  -- 0. The catalog, first.
  --
  -- Capped at 20 per generation. The payload is model output: a malformed or
  -- adversarial response should not be able to append hundreds of rows to a
  -- table every future generation then matches against.
  ---------------------------------------------------------------------------
  for item in
    select * from jsonb_array_elements(coalesce(payload -> 'corrected_ingredients', '[]'::jsonb))
  loop
    exit when v_made >= 20;

    v_name     := nullif(trim(lower(item ->> 'corrected')), '');
    v_original := nullif(trim(item ->> 'original'), '');

    -- The client normalises these already; re-checked here because the client
    -- is not the authority on what may enter a shared catalog.
    continue when v_name is null or length(v_name) > 60 or v_name !~ '[a-z]';

    -- Known by name?
    select i.ingredient_id into v_ingredient_id
      from catalog.ingredients i
     where lower(i.name) = v_name
     limit 1;

    -- Known by alias? This is what stops "zanahoria" creating a second row
    -- beside "carrot" — the Spanish names survive as locale='es' aliases.
    if v_ingredient_id is null then
      select a.ingredient_id into v_ingredient_id
        from catalog.ingredient_aliases a
       where lower(a.alias) = v_name
       limit 1;
    end if;

    -- Genuinely new: create it, unverified. is_verified is exactly this
    -- distinction — curated data versus whatever arrived through a generation.
    if v_ingredient_id is null then
      v_slug := trim(both '-' from regexp_replace(v_name, '[^a-z0-9]+', '-', 'g'));
      continue when v_slug = '';

      insert into catalog.ingredients (slug, name, is_verified)
      values (v_slug, initcap(v_name), false)
      on conflict (slug) do nothing
      returning ingredient_id into v_ingredient_id;

      -- The slug was taken by a row whose name did not match — accents, or a
      -- near-miss. Adopt the existing row rather than failing the generation.
      if v_ingredient_id is null then
        select i.ingredient_id into v_ingredient_id
          from catalog.ingredients i
         where i.slug = v_slug
         limit 1;
      else
        v_made := v_made + 1;
      end if;
    end if;

    -- Keep what the user actually typed as an alias, so the same misspelling
    -- resolves next time instead of being corrected again. locale stays null:
    -- a typo is not a language, and guessing one would poison the es aliases.
    if v_ingredient_id is not null
       and v_original is not null
       and lower(v_original) <> v_name
       and length(v_original) <= 60
    then
      insert into catalog.ingredient_aliases (ingredient_id, alias, locale)
      values (v_ingredient_id, lower(v_original), null)
      on conflict (ingredient_id, alias) do nothing;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 1. The recipe. Unchanged from 20260827100800.
  ---------------------------------------------------------------------------
  insert into recipe.recipes (
    author_id, title, slug, summary, servings, prep_minutes, cook_minutes,
    difficulty, est_cost, currency, source_type, status, visibility, language,
    published_at
  )
  values (
    p_author_id,
    v_recipe ->> 'title',
    v_recipe ->> 'slug',
    v_recipe ->> 'summary',
    (v_recipe ->> 'servings')::smallint,
    (v_recipe ->> 'prep_minutes')::smallint,
    (v_recipe ->> 'cook_minutes')::smallint,
    (v_recipe ->> 'difficulty')::smallint,
    (v_recipe ->> 'est_cost')::numeric,
    coalesce(v_recipe ->> 'currency', 'MXN'),
    'ai',
    v_status,
    v_visibility,
    v_recipe ->> 'language',
    case when v_status = 'published' then now() else null end
  )
  returning recipe_id into v_recipe_id;

  -- Ingredients. Resolve through the alias table before creating anything new,
  -- or the catalog fills up with "jitomate" beside "tomate rojo". Anything the
  -- block above just created is resolvable here.
  for item in select * from jsonb_array_elements(coalesce(payload -> 'ingredients', '[]'::jsonb))
  loop
    v_ingredient_id := null;

    if nullif(trim(item ->> 'name'), '') is not null then
      select i.ingredient_id into v_ingredient_id
        from catalog.ingredients i
       where lower(i.name) = lower(trim(item ->> 'name'))
       limit 1;

      if v_ingredient_id is null then
        select a.ingredient_id into v_ingredient_id
          from catalog.ingredient_aliases a
         where lower(a.alias) = lower(trim(item ->> 'name'))
         limit 1;
      end if;
    end if;

    select u.unit_id into v_unit_id
      from catalog.units u
     where u.code = item ->> 'unit_code'
     limit 1;

    insert into recipe.recipe_ingredients (
      recipe_id, ingredient_id, raw_text, quantity, unit_id,
      preparation, is_optional, group_label, sort_order
    )
    values (
      v_recipe_id,
      v_ingredient_id,
      coalesce(item ->> 'raw_text', item ->> 'name', ''),
      (item ->> 'quantity')::numeric,
      v_unit_id,
      item ->> 'preparation',
      coalesce((item ->> 'is_optional')::boolean, false),
      item ->> 'group_label',
      coalesce((item ->> 'sort_order')::smallint, 0)
    );
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload -> 'steps', '[]'::jsonb))
  loop
    insert into recipe.recipe_steps (recipe_id, step_number, instruction, duration_minutes)
    values (
      v_recipe_id,
      (item ->> 'step_number')::smallint,
      item ->> 'instruction',
      (item ->> 'duration_minutes')::smallint
    );
  end loop;

  if payload ? 'nutrition' and payload -> 'nutrition' <> 'null'::jsonb then
    insert into recipe.recipe_nutrition (
      recipe_id, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, is_estimated
    )
    values (
      v_recipe_id,
      (payload -> 'nutrition' ->> 'calories')::numeric,
      (payload -> 'nutrition' ->> 'protein_g')::numeric,
      (payload -> 'nutrition' ->> 'carbs_g')::numeric,
      (payload -> 'nutrition' ->> 'fat_g')::numeric,
      (payload -> 'nutrition' ->> 'fiber_g')::numeric,
      (payload -> 'nutrition' ->> 'sugar_g')::numeric,
      (payload -> 'nutrition' ->> 'sodium_mg')::numeric,
      true
    );
  end if;

  -- Tag bridges, by slug. Unknown slugs are skipped rather than invented: the
  -- catalog is curated, and a model inventing a cuisine should not extend it.
  -- Ingredients are the deliberate exception, handled above.
  insert into recipe.recipe_cuisines (recipe_id, cuisine_id)
  select v_recipe_id, c.cuisine_id
    from jsonb_array_elements_text(coalesce(payload -> 'cuisines', '[]'::jsonb)) s
    join catalog.cuisines c on c.slug = s
  on conflict do nothing;

  insert into recipe.recipe_diets (recipe_id, diet_id)
  select v_recipe_id, d.diet_id
    from jsonb_array_elements_text(coalesce(payload -> 'diets', '[]'::jsonb)) s
    join catalog.diets d on d.slug = s
  on conflict do nothing;

  insert into recipe.recipe_meal_types (recipe_id, meal_type_id)
  select v_recipe_id, m.meal_type_id
    from jsonb_array_elements_text(coalesce(payload -> 'meal_types', '[]'::jsonb)) s
    join catalog.meal_types m on m.slug = s
  on conflict do nothing;

  insert into recipe.recipe_equipment (recipe_id, equipment_id)
  select v_recipe_id, e.equipment_id
    from jsonb_array_elements_text(coalesce(payload -> 'equipment', '[]'::jsonb)) s
    join catalog.equipment e on e.slug = s
  on conflict do nothing;

  return v_recipe_id;
end;
$$;

revoke execute on function ai.persist_generation from public;
