-- The server-side entry points for api/generate.ts.
--
-- Why these exist at all: service_role bypasses RLS, but it does NOT bypass
-- PostgREST's exposed-schema list. `ai` is deliberately absent from that list,
-- so `supabase.schema('ai').rpc(...)` 404s no matter which key is used. The
-- generation function reaches the ai schema through these three definer
-- wrappers in `recipe`, which IS exposed, and which are granted to service_role
-- and to nobody else.
--
-- That grant is the whole boundary. `revoke ... from public` on each one is not
-- decoration: functions are executable by public by default, and without the
-- revoke any signed-in user could close out someone else's generation.

-- 1. Begin --------------------------------------------------------------------
-- Claims a quota slot and opens the request row in one statement, so two
-- simultaneous requests cannot both see "19 used" and both proceed.

create or replace function recipe.gen_begin(
  p_user_id     uuid,
  p_prompt      text,
  p_filters     jsonb,
  p_model       text,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count      integer;
  v_request_id uuid;
begin
  insert into ai.usage_quota (user_id, usage_date, request_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date)
    do update set request_count = ai.usage_quota.request_count + 1
  returning request_count into v_count;

  if v_count > p_daily_limit then
    -- Give the slot back. The row stays so the counter still reflects the day.
    update ai.usage_quota
       set request_count = request_count - 1
     where user_id = p_user_id and usage_date = current_date;

    return jsonb_build_object('over_quota', true, 'remaining', 0);
  end if;

  insert into ai.generation_requests (user_id, prompt, filters_json, model, status)
  values (p_user_id, p_prompt, p_filters, p_model, 'pending')
  returning request_id into v_request_id;

  return jsonb_build_object(
    'over_quota', false,
    'remaining',  greatest(p_daily_limit - v_count, 0),
    'request_id', v_request_id
  );
end;
$$;

revoke execute on function recipe.gen_begin from public;
grant execute on function recipe.gen_begin to service_role;


-- 2. Succeed ------------------------------------------------------------------
-- Persists the recipe tree, records the raw response, and closes the request.
-- One transaction: a recipe that saved but whose request still reads 'pending'
-- would leave the generation screen spinning forever.

create or replace function recipe.gen_succeed(
  p_request_id   uuid,
  p_author_id    uuid,
  p_payload      jsonb,
  p_raw          jsonb,
  p_tokens_in    integer,
  p_tokens_out   integer,
  p_latency_ms   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_slug      text;
begin
  v_recipe_id := ai.persist_generation(p_payload, p_author_id);

  select slug into v_slug from recipe.recipes where recipe_id = v_recipe_id;

  insert into ai.generation_results (request_id, recipe_id, raw_response)
  values (p_request_id, v_recipe_id, p_raw);

  update ai.generation_requests
     set status        = 'success',
         tokens_input  = p_tokens_in,
         tokens_output = p_tokens_out,
         latency_ms    = p_latency_ms,
         completed_at  = now()
   where request_id = p_request_id;

  update ai.usage_quota
     set token_count = token_count + coalesce(p_tokens_in, 0) + coalesce(p_tokens_out, 0)
   where user_id = p_author_id and usage_date = current_date;

  return jsonb_build_object('recipe_id', v_recipe_id, 'slug', v_slug);
end;
$$;

revoke execute on function recipe.gen_succeed from public;
grant execute on function recipe.gen_succeed to service_role;


-- 3. Fail ---------------------------------------------------------------------
-- The raw response is stored even here, and especially here: a generation that
-- failed to parse is the only kind you actually need the bytes for.

create or replace function recipe.gen_fail(
  p_request_id uuid,
  p_status     text,
  p_error      text,
  p_raw        jsonb default null,
  p_latency_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_raw is not null then
    insert into ai.generation_results (request_id, recipe_id, raw_response)
    values (p_request_id, null, p_raw);
  end if;

  update ai.generation_requests
     set status        = p_status,
         error_message = p_error,
         latency_ms    = p_latency_ms,
         completed_at  = now()
   where request_id = p_request_id;
end;
$$;

revoke execute on function recipe.gen_fail from public;
grant execute on function recipe.gen_fail to service_role;
