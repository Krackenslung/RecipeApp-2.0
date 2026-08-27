-- app — identity and permissions.
--
-- Supabase Auth owns login entirely. auth.users holds the email, the password
-- hash, the confirmation state and the Google link; this schema holds only what
-- a *profile* is. The identity schema is named `app` and not `auth` because
-- GoTrue owns `auth` and will not let us create tables there.
--
-- Every other table in the database references auth.users(id), never
-- app.profiles — the profile is a satellite, not the identity.

create schema if not exists app;

grant usage on schema app to anon, authenticated;


-- 1. profiles -----------------------------------------------------------------

create table app.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text        not null,
  display_name text,
  avatar_url   text,
  bio          text,
  locale       text        not null default 'es-MX',
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint ck_profiles_username check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint ck_profiles_bio_len  check (bio is null or length(bio) <= 500)
);

comment on table app.profiles is
  '1:1 with auth.users, sharing its UUID. Everything about a user that is not credentials.';

-- Partial, so a soft-deleted account frees its username for someone else.
create unique index ux_profiles_username
  on app.profiles (lower(username))
  where deleted_at is null;

alter table app.profiles enable row level security;

-- Public: /u/:username is an anonymous-visitable route.
create policy "profiles are public"
  on app.profiles for select
  using (deleted_at is null);

create policy "update own profile"
  on app.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert policy on purpose. The row is created by the trigger below, which
-- runs as definer; a client that could insert here could claim any username
-- against any auth.users row.

grant select on app.profiles to anon, authenticated;
grant update on app.profiles to authenticated;


-- 2. roles --------------------------------------------------------------------

create table app.roles (
  role_id      smallint primary key,
  code         text not null unique,
  display_name text not null
);

comment on column app.roles.code is
  'What app.has_role() matches on. Policies check the code, never the numeric id.';

insert into app.roles (role_id, code, display_name) values
  (1, 'user',      'User'),
  (2, 'moderator', 'Moderator'),
  (3, 'admin',     'Admin');

alter table app.roles enable row level security;

create policy "roles are readable"
  on app.roles for select
  using (true);

grant select on app.roles to anon, authenticated;


-- 3. user_roles ---------------------------------------------------------------

create table app.user_roles (
  user_id uuid     not null references auth.users (id) on delete cascade,
  role_id smallint not null references app.roles (role_id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

alter table app.user_roles enable row level security;

-- You may see your own grants; nobody may write them from the client. Roles are
-- handed out with service_role or from the SQL editor, deliberately.
create policy "read own roles"
  on app.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

grant select on app.user_roles to authenticated;


-- 4. has_role() ---------------------------------------------------------------
--
-- Policies must not query app.user_roles inline: a policy on user_roles that
-- selects from user_roles recurses. Going through a definer function breaks the
-- cycle, because the function body is not itself subject to RLS.
--
-- `set search_path = ''` plus fully-qualified names is mandatory on any definer
-- function — without it, a caller can prepend a schema of their own and have
-- this run against their tables instead of ours.

create or replace function app.has_role(check_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from app.user_roles ur
      join app.roles r on r.role_id = ur.role_id
     where ur.user_id = (select auth.uid())
       and r.code = check_code
  );
$$;

comment on function app.has_role is
  'Role check used inside policies and by the /moderation route guard.';

grant execute on function app.has_role to authenticated;


-- 5. The profile row is born with the auth user -------------------------------
--
-- The client cannot write to auth, so the username travels in user_metadata and
-- this trigger reads it back out.
--
-- It must never raise. GoTrue wraps any exception from a trigger on auth.users
-- into an opaque "Database error saving new user" 500, and the signup screen has
-- no way to tell the user what actually went wrong. So a missing, malformed or
-- already-taken username degrades to a generated one rather than aborting the
-- account. The user can set a real one from /settings.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fallback  text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  candidate text;
begin
  candidate := nullif(trim(lower(new.raw_user_meta_data ->> 'username')), '');

  if candidate is null or candidate !~ '^[a-z0-9_]{3,30}$' then
    candidate := fallback;
  end if;

  if exists (
    select 1 from app.profiles p
     where lower(p.username) = candidate and p.deleted_at is null
  ) then
    candidate := fallback;
  end if;

  insert into app.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    -- Google returns full_name/name; email signup sends display_name or nothing.
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger tr_profiles_from_auth
  after insert on auth.users
  for each row execute function app.handle_new_user();


-- 6. updated_at ---------------------------------------------------------------
-- Shared by every table that carries the column. Touches only NEW, its own row,
-- so it stays security invoker.

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tr_profiles_updated
  before update on app.profiles
  for each row execute function app.touch_updated_at();
