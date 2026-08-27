# CLAUDE.md

Guidance for Claude Code working on **Recipe App 2.0**.

`README.md` describes what the project is: the stack, the 36-table schema, the routes, the design
system, and what still needs building. Read it first. This file is only the rules — the things that
are easy to get wrong and expensive to get wrong.

The single fact that shapes everything below: **there is no backend to enforce anything.** The
browser holds a public key and talks to Postgres through PostgREST. Every rule about RLS, secrets
and `service_role` is load-bearing, not stylistic.

---

## Security invariants

These are the ones that turn a mistake into a data breach rather than a bug.

**A table in an exposed schema without RLS is public.** The `anon` key ships in the bundle; anyone
can read it out of the JS. RLS is the only thing between that key and the data.

**`service_role` bypasses every policy on every table.** It appears in exactly one file,
`api/generate.ts`, and only after the caller's token has been verified. Never in `src/`. Never
behind a `VITE_` prefix — that inlines it into the client bundle at build time and publishes the
entire database, `ai` schema included.

**The `ai` schema is never added to the exposed-schemas list.** It holds prompts, raw model output
and quota counters.

**`security_invoker = true` on every view.** A Postgres view runs with its owner's privileges by
default, so without it the view returns every row regardless of the policies on the tables beneath.
This is the easiest way to accidentally publish the whole database — check it on every view you
write.

**Never write `user_id` from the client.** Give the column `default auth.uid()` and let the
`with check` policy enforce it. Identity comes from the token, never from the request body.

---

## SQL

### Naming

`snake_case`, lowercase, unquoted. Tables plural (`recipes`); bridge tables both nouns plural
(`recipe_cuisines`); booleans `is_`/`has_` prefixed; timestamps `_at` suffixed.

### Row Level Security

Every table gets policies **in the same migration that creates it**. A table shipped without
policies is a data leak, and splitting it across two migrations means the leak exists in between.

```sql
alter table recipe.recipes enable row level security;

create policy "read published or own"
  on recipe.recipes for select
  using (
    (status = 'published' and visibility = 'public')
    or author_id = (select auth.uid())
  );

create policy "insert own"
  on recipe.recipes for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "update own"
  on recipe.recipes for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
```

- **Wrap `auth.uid()` in a subselect** — `(select auth.uid())`. Bare, it re-evaluates per row;
  wrapped, Postgres hoists it into an InitPlan. On a large table that's the difference between a
  sequential scan and an index seek.
- **Index every column a policy filters on.** A policy on `author_id` with no index makes every
  query a sequential scan.
- **One policy per operation.** A single `for all` policy conflates read and write rules and is
  almost always wrong.
- **Scope writes `to authenticated`** so `anon` isn't even evaluated.
- **Catalog tables get `select` policies only.**

### Functions used inside policies

Role checks go through a helper, never an inline subquery on `app.user_roles` — a policy on
`user_roles` that queries `user_roles` recurses:

```sql
create or replace function app.has_role(check_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.user_roles ur
    join app.roles r on r.role_id = ur.role_id
    where ur.user_id = (select auth.uid()) and r.code = check_code
  );
$$;
```

`security definer` + `set search_path = ''` with fully-qualified names is required on any function
used inside a policy.

### Triggers that write to another table need `security definer`

`tr_ratings_aggregate` and `tr_saved_aggregate` update `recipe.recipes` on behalf of a user who
doesn't own the row. As `invoker`, the UPDATE is filtered by the `"update own"` policy, matches zero
rows, and **raises no error** — the counters just freeze. Nothing in the UI reveals it.

`tr_recipes_updated` only touches `NEW`, its own row, so it stays `invoker`.

### Migrations

Forward-only, one concern per file, always checked in.

```powershell
supabase migration new add_recipe_nutrition
supabase db reset          # local: replay everything
supabase db push           # remote: apply pending
```

**Never edit a migration that has been pushed** — write a new one. **Never change the schema through
the Supabase dashboard**; it has no history and the next `db reset` silently discards it.

After any migration that alters a table shape:

```powershell
supabase gen types typescript --local > src/types/database.ts
```

That file is generated output. Don't hand-edit it — if it's wrong, the migration is wrong.

---

## Data access from the frontend

All CRUD goes through `supabase-js` wrapped in TanStack Query. There is no REST API of our own to
`fetch` — the one exception is `POST /api/generate`, which exists only because the Gemini key can't
ship to a browser.

**Always check `error`.** `supabase-js` returns `{ data, error }` and does not throw. An unchecked
error reads as an empty result — which is exactly how an RLS misconfiguration hides. This is the
single most common way to ship a broken screen that looks like it works.

**One `createClient()`** for the whole app, in `src/lib/supabase.ts`. Multiple instances fight over
the session in storage.

**Components never import `supabase`.** They call hooks from `src/queries/`, one file per resource.

**Select columns explicitly**, except from views built for a screen.

**Always paginate** with `.range()`. PostgREST will happily return the whole table.

**Use embedded resources** (`select('*, recipe_ingredients(*)')`) instead of N+1 round-trips.

**Name the schema** — a non-`public` schema must be addressed explicitly:
`supabase.schema('recipe').from('recipes')`.

---

## Frontend

**Modules:** ESM everywhere. **TypeScript:** `.ts` / `.tsx`, `@/` aliases `src/`.

**Row types come from `src/types/database.ts`.** Don't hand-write interfaces that will drift from
the schema.

**`ui/` owns the Tailwind vocabulary.** `Button` decides what "primary" means; no page writes those
class strings by hand. This is what stops them drifting across fifty files.

**No arbitrary color values.** `bg-[#e74c3c]` is a bug; if a color is worth using twice it belongs
in `@theme` in `src/index.css`. Arbitrary *sizes* (`h-[180px]`) are fine.

**No `dark:` variants.** The app is light-only by design.

**Auth is a layout route**, never a check inside a page body — a page that checks in its own body
flashes content before redirecting.

**Assets are imported, not referenced by path.** `import logo from '@/assets/logo.png'` so Vite
fingerprints them. There is no `public/` folder.

**Every list state is designed:** loading (skeleton cards that carry the same shadow as the real
card, or the list pops when data lands), empty, and error. No bare spinners standing in for a list.

**Respect `prefers-reduced-motion`.** There's a `useReducedMotion` hook; the servings ticker becomes
an instant swap.

---

## Copy and errors

**Never surface a raw Postgres or Gemini error to the user.** They leak column names, constraint
definitions and prompt content. Log the detail with a `[scope]` tag, show a plain message.

```ts
console.error('[auth] signIn', authError);
setError('Wrong email or password.');
```

Active voice, sentence case. The button that says "Publish" produces a toast that says "Published".

UI copy is **English**. Catalog names (cuisines, diets, ingredients) arrive from the database in
Spanish — that's data, not copy, and isn't something to "fix" in the frontend.

---

## Comments

**Never delete existing comments in the user's code.** Preserve them as written when editing a file.

The comments in this codebase carry reasoning that isn't recoverable from the code — why the shell
is `h-dvh` and not `min-h-dvh`, why `draft` and `applied` are separate state, why an `alt` is
conditional. Match that: comment the decision, not the mechanics.

---

## Before saying it works

```powershell
npm run typecheck
npm run build
npm test
```

`filterArgs.test.ts` (17 cases) covers the filter → RPC mapping, the most error-prone module in the
frontend. It should stay green without being edited; if a change requires touching it, that's worth
saying out loud rather than quietly updating the assertions.

Two greps worth running on any change that touches styling or secrets:

```powershell
Select-String -Path src\*.ts,src\*.tsx -Pattern '\[#'          # arbitrary colors
Select-String -Path .env*,src\ -Pattern 'VITE_.*SERVICE_ROLE'  # the fatal one
```
