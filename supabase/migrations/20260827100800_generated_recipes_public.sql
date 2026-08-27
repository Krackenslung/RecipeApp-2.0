-- Generated recipes are published and public on arrival.
--
-- The previous version hardcoded draft/private and ignored whatever the payload
-- asked for, on the reasoning that "the model proposes, the user publishes".
-- That call is reversed: a generation that lands invisible does not reach the
-- feed, and the feed was the point.
--
-- Two changes, not one. The default flips, AND the hardcoding goes: status and
-- visibility now come from the payload when it supplies them. Whether a
-- generation is public is a policy decision that belongs to the caller in
-- api/generate.ts, not to the procedure that writes rows — the old version
-- could not be overridden even deliberately.
--
-- The CHECK constraints on recipe.recipes still police the values, so a payload
-- asking for 'banana' fails loudly rather than being silently coerced.
--
-- Replaces the function created in 20260827100400_ai.sql. Same signature, same
-- name: nothing that calls it has to change.

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
begin
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
    -- ix_recipes_feed orders on published_at, and a published row with a null
    -- one sorts last forever. Set together or not at all.
    case when v_status = 'published' then now() else null end
  )
  returning recipe_id into v_recipe_id;

  -- Ingredients. Resolve through the alias table before creating anything new,
  -- or the catalog fills up with "jitomate" beside "tomate rojo".
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
