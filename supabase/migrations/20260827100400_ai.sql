-- ai — Gemini traceability and cost control.
--
-- NEVER exposed to PostgREST. It is absent from the schema list in config.toml,
-- and on top of that every table here has RLS enabled with ZERO policies: even
-- if someone adds `ai` to the exposed list by accident, anon and authenticated
-- still match no rows. Only service_role, which bypasses RLS entirely, gets in.
--
-- The client's one window into this schema is recipe.get_generation_status(),
-- at the bottom of this file.

create schema if not exists ai;

-- No `grant usage ... to anon, authenticated`. That omission is deliberate and
-- is the outer of the two locks.


-- 1. generation_requests ------------------------------------------------------
-- One row per Gemini call. Without it you cannot say what a generation cost or
-- why it failed.

create table ai.generation_requests (
  request_id    uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  prompt        text,
  -- jsonb, not text: it validates structurally on write and indexes with GIN.
  filters_json  jsonb,
  model         text,
  status        text not null default 'pending'
                  check (status in ('pending', 'success', 'failed', 'filtered')),
  tokens_input  integer,
  tokens_output integer,
  latency_ms    integer,
  error_message text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index ix_generation_requests_user on ai.generation_requests (user_id, created_at desc);


-- 2. generation_results -------------------------------------------------------

create table ai.generation_results (
  result_id    integer generated always as identity primary key,
  request_id   uuid not null references ai.generation_requests (request_id) on delete cascade,
  -- Nullable: there was a response but the parser failed. That case is the whole
  -- reason raw_response is stored unconditionally.
  recipe_id    uuid references recipe.recipes (recipe_id) on delete set null,
  raw_response jsonb,
  created_at   timestamptz not null default now()
);

create index ix_generation_results_request on ai.generation_results (request_id);


-- 3. usage_quota --------------------------------------------------------------
-- Persisted, not held in process memory: Vercel Functions are stateless per
-- invocation, so an in-memory counter resets on every cold start and enforces
-- nothing.

create table ai.usage_quota (
  user_id       uuid not null references auth.users (id) on delete cascade,
  usage_date    date not null default current_date,
  request_count integer not null default 0,
  token_count   integer not null default 0,
  primary key (user_id, usage_date)
);


-- 4. RLS with no policies -----------------------------------------------------

alter table ai.generation_requests enable row level security;
alter table ai.generation_results  enable row level security;
alter table ai.usage_quota         enable row level security;


-- 5. persist_generation -------------------------------------------------------
--
-- One transaction for the whole recipe tree. Sequential unbatched inserts from
-- the function leave a half-written recipe behind when the fifth one fails; a
-- single call either writes all of it or none.
--
-- Expected payload:
--   {
--     "recipe":      { title, slug, summary, servings, prep_minutes, ... },
--     "ingredients": [ { raw_text, name, quantity, unit_code, preparation,
--                        is_optional, group_label } ],
--     "steps":       [ { step_number, instruction, duration_minutes } ],
--     "nutrition":   { calories, protein_g, carbs_g, fat_g, ... },
--     "cuisines":    ["mexicana"],      -- slugs
--     "diets":       ["vegetariana"],
--     "meal_types":  ["cena"],
--     "equipment":   ["horno"]
--   }

create or replace function ai.persist_generation(payload jsonb, p_author_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_recipe    jsonb := payload -> 'recipe';
  item        jsonb;
  v_ingredient_id integer;
  v_unit_id       smallint;
begin
  insert into recipe.recipes (
    author_id, title, slug, summary, servings, prep_minutes, cook_minutes,
    difficulty, est_cost, currency, source_type, status, visibility, language
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
    -- The model proposes, the user publishes. A generation is never public on
    -- arrival, whatever the payload asks for.
    'draft',
    'private',
    v_recipe ->> 'language'
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

-- Not granted to anon or authenticated. api/generate.ts calls it with
-- service_role, after it has verified who the caller is.
revoke execute on function ai.persist_generation from public;


-- 6. get_generation_status ----------------------------------------------------
--
-- Lives in `recipe`, not in `ai`, and this is not a detail: PostgREST can only
-- call what is in an exposed schema, and exposing `ai` is the one thing this
-- design will not do. So the client-facing wrapper sits in `recipe` and reaches
-- across as definer.
--
-- The where clause on auth.uid() is the whole security boundary — definer means
-- RLS is not doing it for us here.

create or replace function recipe.get_generation_status(p_request_id uuid)
returns table (
  request_id    uuid,
  status        text,
  recipe_id     uuid,
  recipe_slug   text,
  error_message text,
  created_at    timestamptz,
  completed_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gr.request_id,
    gr.status,
    res.recipe_id,
    r.slug as recipe_slug,
    gr.error_message,
    gr.created_at,
    gr.completed_at
  from ai.generation_requests gr
  left join ai.generation_results res on res.request_id = gr.request_id
  left join recipe.recipes r          on r.recipe_id    = res.recipe_id
  where gr.request_id = p_request_id
    and gr.user_id = (select auth.uid());
$$;

comment on function recipe.get_generation_status is
  'The client''s only window into the ai schema. Returns rows owned by auth.uid() and nothing else.';

grant execute on function recipe.get_generation_status to authenticated;
