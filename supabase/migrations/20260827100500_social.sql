-- social — interaction between users.
--
-- Every user_id column defaults to auth.uid(). The client never sends one: the
-- identity comes from the token, and the with-check policy enforces that the
-- default was not overridden.

create schema if not exists social;

grant usage on schema social to anon, authenticated;


-- 1. ratings ------------------------------------------------------------------
-- The (user, recipe) pair IS the identity, which gives "one vote per user per
-- recipe" for free — no unique constraint bolted on beside a surrogate key.

create table social.ratings (
  user_id    uuid     not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id  uuid     not null references recipe.recipes (recipe_id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index ix_ratings_recipe on social.ratings (recipe_id);

alter table social.ratings enable row level security;

create policy "ratings are readable"  on social.ratings for select using (true);
create policy "rate as yourself"      on social.ratings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "change own rating"     on social.ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own rating"     on social.ratings for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on social.ratings to anon, authenticated;
grant insert, update, delete on social.ratings to authenticated;


-- 2. comments -----------------------------------------------------------------

create table social.comments (
  comment_id integer generated always as identity primary key,
  recipe_id  uuid not null references recipe.recipes (recipe_id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- One level of threading. Self-referencing, cascade so a deleted parent takes
  -- its replies with it.
  parent_id  integer references social.comments (comment_id) on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: hard-deleting a parent would take an entire conversation with
  -- it, so a removed comment keeps its place in the thread.
  deleted_at timestamptz
);

create index ix_comments_recipe on social.comments (recipe_id, created_at);

create trigger tr_comments_updated
  before update on social.comments
  for each row execute function app.touch_updated_at();

alter table social.comments enable row level security;

create policy "comments are readable" on social.comments for select using (deleted_at is null);
create policy "comment as yourself"   on social.comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own comment"      on social.comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "moderators edit any"   on social.comments for update to authenticated
  using (app.has_role('moderator')) with check (app.has_role('moderator'));

grant select on social.comments to anon, authenticated;
grant insert, update on social.comments to authenticated;


-- 3. saved_recipes ------------------------------------------------------------

create table social.saved_recipes (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references recipe.recipes (recipe_id) on delete cascade,
  saved_at  timestamptz not null default now(),
  notes     text,
  primary key (user_id, recipe_id)
);

create index ix_saved_recipe on social.saved_recipes (recipe_id);

alter table social.saved_recipes enable row level security;

-- Private, unlike ratings: who saved what is nobody else's business, and the
-- public counter is served by recipes.save_count instead.
create policy "read own saves"   on social.saved_recipes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "save as yourself" on social.saved_recipes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own save"    on social.saved_recipes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "unsave own"       on social.saved_recipes for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on social.saved_recipes to authenticated;


-- 4. collections --------------------------------------------------------------

create table social.collections (
  collection_id   uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  description     text,
  cover_image_url text,
  is_public       boolean not null default false,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index ux_collection_name_per_user
  on social.collections (user_id, lower(name))
  where deleted_at is null;

alter table social.collections enable row level security;

create policy "read public or own" on social.collections for select
  using (deleted_at is null and (is_public or user_id = (select auth.uid())));
create policy "create own collection" on social.collections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own collection" on social.collections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own collection" on social.collections for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on social.collections to anon, authenticated;
grant insert, update, delete on social.collections to authenticated;


-- 5. collection_recipes -------------------------------------------------------

create table social.collection_recipes (
  collection_id uuid not null references social.collections (collection_id) on delete cascade,
  recipe_id     uuid not null references recipe.recipes (recipe_id) on delete cascade,
  sort_order    smallint not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);

alter table social.collection_recipes enable row level security;

-- Membership follows the collection's own visibility, so there is one place
-- where "who may see this collection" is decided.
create policy "visible with the collection" on social.collection_recipes for select
  using (exists (
    select 1 from social.collections c
     where c.collection_id = collection_recipes.collection_id));

create policy "add to own collection" on social.collection_recipes for insert to authenticated
  with check (exists (
    select 1 from social.collections c
     where c.collection_id = collection_recipes.collection_id
       and c.user_id = (select auth.uid())));

create policy "reorder own collection" on social.collection_recipes for update to authenticated
  using (exists (
    select 1 from social.collections c
     where c.collection_id = collection_recipes.collection_id
       and c.user_id = (select auth.uid())));

create policy "remove from own collection" on social.collection_recipes for delete to authenticated
  using (exists (
    select 1 from social.collections c
     where c.collection_id = collection_recipes.collection_id
       and c.user_id = (select auth.uid())));

grant select on social.collection_recipes to anon, authenticated;
grant insert, update, delete on social.collection_recipes to authenticated;


-- 6. follows ------------------------------------------------------------------

create table social.follows (
  follower_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint ck_no_self_follow check (follower_id <> followee_id)
);

create index ix_follows_followee on social.follows (followee_id);

alter table social.follows enable row level security;

create policy "follows are readable" on social.follows for select using (true);
create policy "follow as yourself"   on social.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "unfollow own"         on social.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

grant select on social.follows to anon, authenticated;
grant insert, delete on social.follows to authenticated;


-- 7. preferences --------------------------------------------------------------
-- These preload the sidebar on sign-in. Private to their owner.

create table social.user_diet_preferences (
  user_id uuid     not null default auth.uid() references auth.users (id) on delete cascade,
  diet_id smallint not null references catalog.diets (diet_id) on delete cascade,
  primary key (user_id, diet_id)
);

create table social.user_allergen_preferences (
  user_id     uuid     not null default auth.uid() references auth.users (id) on delete cascade,
  allergen_id smallint not null references catalog.allergens (allergen_id) on delete cascade,
  primary key (user_id, allergen_id)
);

do $$
declare t text;
begin
  foreach t in array array['user_diet_preferences', 'user_allergen_preferences']
  loop
    execute format('alter table social.%I enable row level security', t);
    execute format($p$
      create policy "read own preferences" on social.%I for select to authenticated
      using (user_id = (select auth.uid()))$p$, t);
    execute format($p$
      create policy "set own preferences" on social.%I for insert to authenticated
      with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$
      create policy "clear own preferences" on social.%I for delete to authenticated
      using (user_id = (select auth.uid()))$p$, t);
    execute format('grant select, insert, delete on social.%I to authenticated', t);
  end loop;
end $$;


-- 8. reports ------------------------------------------------------------------

create table social.reports (
  report_id   integer generated always as identity primary key,
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('recipe', 'comment', 'user')),
  -- text, not bigint, and deliberately without a FK: the targets have mixed key
  -- types now (recipes is uuid, comments is integer). Polymorphic, so it is
  -- validated in app code and cast on read.
  target_id   text not null,
  reason      text not null,
  details     text,
  status      text not null default 'open'
                check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index ix_reports_status on social.reports (status, created_at desc);

alter table social.reports enable row level security;

create policy "read own reports" on social.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "moderators read all" on social.reports for select to authenticated
  using (app.has_role('moderator'));
create policy "report as yourself" on social.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "moderators resolve" on social.reports for update to authenticated
  using (app.has_role('moderator')) with check (app.has_role('moderator'));

grant select, insert, update on social.reports to authenticated;


-- 9. The denormalized counters ------------------------------------------------
--
-- Both of these write to recipe.recipes on behalf of someone who does not own
-- that row. As security invoker the UPDATE would be filtered by the "update own"
-- policy, match zero rows, and RAISE NO ERROR — the counters would simply freeze,
-- with nothing in the UI to suggest why. security definer is what makes them work.

create or replace function social.refresh_rating_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update recipe.recipes r
     set rating_avg   = agg.avg_rating,
         rating_count = agg.n
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*) as n
        from social.ratings
       where recipe_id = v_recipe_id
    ) agg
   where r.recipe_id = v_recipe_id;

  return null;
end;
$$;

create trigger tr_ratings_aggregate
  after insert or update or delete on social.ratings
  for each row execute function social.refresh_rating_aggregate();

create or replace function social.refresh_save_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update recipe.recipes r
     set save_count = (select count(*) from social.saved_recipes where recipe_id = v_recipe_id)
   where r.recipe_id = v_recipe_id;

  return null;
end;
$$;

create trigger tr_saved_aggregate
  after insert or delete on social.saved_recipes
  for each row execute function social.refresh_save_aggregate();
