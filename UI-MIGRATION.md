# UI-MIGRATION.md — porting the Recipe App 1.0 look to 2.0

Style document for Recipe App 2.0. **Replaces the "Design direction" section of `FRONTEND.md`.**
Everything else in `FRONTEND.md` (stack, routes, `filterArgs`, TanStack Query, RLS) stands unchanged.

> **Amendment — card shadows.** §3 below says recipe cards carry no shadow, and the §6 checklist
> greps for `shadow-*`. That call was reversed by the author after the migration landed: cards do
> have a shadow, via a single `--shadow-card` token in `@theme`. The code is correct; those two
> spots in this document are not. See "Design direction" in `FRONTEND.md`.

## 0. Context: why this file exists

`FRONTEND.md` defined a visual direction that deliberately moved away from 1.0:

> *"Cards have no shadows. A 1px `border-ceniza/20` and a flat `bg-cal`. Shadows on cards is the
> templated answer and it's what v1 looked like."*

That call is reversed. The 1.0 design is the target, not the antipattern. Any instruction in
`FRONTEND.md` that contradicts this file loses.

What does **not** change: the stack (Vite + React 19 + TS + Tailwind v4 CSS-first), the routes,
the hooks in `src/queries/`, and `src/utils/filterArgs.ts`. This is a change of skin, not of
architecture.

> **Amendment — language.** This document originally specified Spanish (`es-MX`) copy. The whole
> project is now in English: all UI copy, `lang="en"`, and `en-US` locales in `format.ts`. Catalog
> names (cuisines, diets, allergens, ingredients) still come from the database in Spanish.

---

## 1. Tokens

The whole palette comes from the real 1.0 CSS (`index.css`, `Layout.css`, `RecipeCard.css`,
`auth.css`). It goes into `src/index.css` inside `@theme`, replacing the masa/comal/guajillo tokens.

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* Text */
  --color-ink:          #1a1a1a;   /* headings, recipe names */
  --color-body:         #555555;   /* body copy, labels, inactive nav */
  --color-muted:        #888888;   /* metadata, card footer */

  /* Surfaces */
  --color-surface:      #ffffff;   /* header, sidebar, cards, filter rail */
  --color-canvas:       #f8f9fa;   /* content area background */

  /* Borders — three weights, not one */
  --color-line:         #e9ecef;   /* chrome: header, sidebar, rails */
  --color-line-strong:  #dddddd;   /* card border */
  --color-hairline:     #f0f0f0;   /* internal rules, chip background */

  /* Accent */
  --color-brand:        #e74c3c;
  --color-brand-dark:   #c0392b;   /* primary button hover */
  --color-brand-soft:   #fdecea;   /* active nav background */
  --color-success:      #198754;   /* selected cost level */

  /* Radii */
  --radius-card:        8px;
  --radius-chip:        4px;

  /* Typography */
  --font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

**Rules of use**

- Every token generates its own utility: `bg-surface`, `text-brand`, `border-line`, `rounded-card`.
  Don't write arbitrary values (`bg-[#e74c3c]`) — if a color is used twice, it goes in `@theme`.
- `--color-brand` is the only accent. It shows up in: active nav, primary button, section headings,
  ingredient bullets, numbered step badges. **The "one guajillo per screen" restriction from
  `FRONTEND.md` is dropped** — 1.0 uses the red generously and it looks right that way.
- No dark mode. 1.0 declares `color-scheme: light` and there are no `dark:` variants.

**Open decision — typography.**
1.0 had no display face; it used Bootstrap's system stack. Inter is proposed here for all body copy,
keeping JetBrains Mono **only** for quantities, times and costs, because tabular figures align the
ingredient ledger and that doesn't clash with the 1.0 look. **Fraunces is dropped.** If you want
total fidelity to 1.0, drop the mono too and delete the Google Fonts `<link>`s from `index.html`.

---

## 2. Shell structure

The biggest change. 2.0 currently has a horizontal nav plus `<main class="mx-auto max-w-7xl">`.
1.0 uses a three-zone app grid, and that is what the reference screenshot shows.

### 2.1 `AppShell.tsx` — three-zone grid

Exact measurements from 1.0's `Layout.css`:

| Zone | Measurement | Style |
|---|---|---|
| Header | `60px`, full width (`grid-column: 1 / -1`) | `bg-surface`, `border-b border-line`, `sticky top-0 z-50`, side padding `1.5rem` |
| Sidebar | `240px`, column 1 | `bg-surface`, `border-r border-line`, `sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto` |
| Content | `1fr`, column 2 | `bg-canvas`, padding `2rem`, `overflow-y-auto` |

```tsx
<div className="grid min-h-dvh grid-cols-[240px_1fr] grid-rows-[60px_1fr]">
  <header className="col-span-full row-start-1 sticky top-0 z-50 flex items-center
                     justify-between border-b border-line bg-surface px-6">…</header>
  <aside  className="col-start-1 row-start-2 sticky top-[60px] h-[calc(100dvh-60px)]
                     overflow-y-auto border-r border-line bg-surface">…</aside>
  <main   className="col-start-2 row-start-2 overflow-y-auto bg-canvas p-8">
    <Outlet />
  </main>
</div>
```

> **Amendment — `min-h-dvh`.** As implemented, the container is `h-dvh`, not `min-h-dvh`. A sticky
> header inside a 60px grid row has no travel to stick through, so it scrolled away; pinning the
> grid to the viewport and letting `<main>` be the scroller is what actually holds the chrome.

The centered `max-w-7xl` goes away. Content fills the column. The existing `Skip to content`
skip-link is kept.

### 2.2 Navigation sidebar

Replaces the current horizontal nav in `Header`. The items move to the sidebar; the profile
dropdown stays in the header.

- Container: `flex flex-col gap-1 p-3` (`padding: 1rem 0.75rem` in 1.0).
- Link: `flex items-center gap-2 rounded-card px-4 py-2.5 text-body hover:no-underline`
- Active link: `bg-brand-soft text-brand` — this is the pale rose from the screenshot.
- Items: Home (`/`), Generate recipe (`/generate`), History (`/me`), Settings (`/settings`),
  plus the 2.0 ones that didn't exist in 1.0 (Collections, Saved).

### 2.3 Header

- Left: the `recipes_powered_by_gemini_logo.png` logo at `h-9` (36px). It lives in the 1.0 repo
  under `frontend/src/assets/`; copy it to `src/assets/`. It replaces the `ChefHat` + "Recipes"
  lockup.
- Right: `flex items-center gap-2.5 text-body` — user icon, name, and a **Sign out** button with a
  red outline (`variant="danger"`, `size="sm"`).

### 2.4 Generation / feed view — two panes

From `.generate-layout` in 1.0. Applies to `/generate` and to `/` (the feed carries filters too).

```
grid-cols-[1fr_500px]
grid-rows-[1fr_auto]
areas:  "results  filters"
        "footer   filters"
```

- `<main>` loses its padding on these routes (`.app-content:has(.generate-layout){padding:0}`).
  In React, solve it with a prop on the route or a conditional class, not with `:has()`.
- Results pane: `overflow-y-auto p-12` (`3rem`), cards stacked in a column with `gap-5`.
- Filter rail: `w-[500px] overflow-y-auto border-l border-line bg-surface px-3 py-4`, full height,
  independent scroll.
- Below `lg` the panes stack and the rail becomes a `<dialog>` (you already have `useDialog`).

---

## 3. Class recipes per component

These strings live **only** inside the component that defines them. No page writes button classes
by hand — that is what stops them drifting between files.

### `ui/Button.tsx`

Replaces the current `VARIANTS` map. Note the change from `rounded-none` to `rounded-card`.

```ts
const BASE = 'inline-flex items-center justify-center gap-2 rounded-card font-medium ' +
             'transition-colors disabled:cursor-not-allowed disabled:opacity-70 select-none';

const VARIANTS = {
  primary:   'bg-brand text-white hover:bg-brand-dark',
  secondary: 'border border-line-strong bg-surface text-body hover:bg-hairline',
  ghost:     'text-body hover:text-ink',
  danger:    'border border-brand text-brand hover:bg-brand hover:text-white',
  success:   'bg-success text-white',   // selected cost level
};

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};
```

Filter toggle buttons (Cost, Difficulty): `size="sm"`, `secondary` when unselected. Selected →
`success` for Cost, `primary` for Difficulty. This is exactly 1.0's behaviour and explains the two
different colors in the screenshot.

### `ui/Chip.tsx` — recipe and filter tags

- Recipe tag: `rounded-chip bg-hairline px-2 py-0.5 text-xs text-body whitespace-nowrap`
- Selected filter tag (removable): same body plus a lucide `X` icon at `12px`, `cursor-pointer`,
  with `aria-label="Remove {tag}"`.

### `ui/Field.tsx` — inputs, selects, textarea

- Label: `mb-1.5 block font-semibold text-body`
- Control: `w-full rounded-card border border-line-strong bg-surface px-3 py-2 text-body
  placeholder:text-muted focus:border-line-strong focus:outline-none`
  1.0 explicitly kills Bootstrap's focus glow (`box-shadow: none`).
- Input + button group (ingredient autocomplete): input with square right corners, a `+` button
  welded on with square left corners. Contiguous borders, no doubled line.
- Suggestions dropdown: `absolute z-30 w-full max-h-40 overflow-y-auto rounded-card
  border border-line-strong bg-surface`, items `px-3 py-2 text-body hover:bg-hairline`.

### `recipe/RecipeCard.tsx`

From `RecipeCard.css`. **No shadow** — 1.0 didn't have one either; it's told apart by its border.
*(Superseded — see the amendment at the top of this file.)*

- Container: `flex flex-col overflow-hidden rounded-card border border-line-strong
  bg-surface cursor-pointer`
- Image: `h-[180px] w-full object-cover` (detail variant: `h-[260px]`).
  Fallback `no_recipe_image.png`, also in the 1.0 assets.
- Body: `flex flex-1 flex-col gap-2 p-4`
- Name: `m-0 leading-tight text-ink line-clamp-2`
- Footer: `flex justify-between border-t border-hairline px-4 py-2.5 text-muted`

### Recipe detail

- Section heading: `uppercase text-brand mb-1.5` (INGREDIENTS, METHOD).
- Ingredients: `list-none p-0 m-0 flex flex-col gap-1`, with a `::before` of content `•` in
  `text-brand` and `mr-2`. The two-column ledger with quantities in mono can be kept — it is
  compatible with the 1.0 style and doesn't contradict it.
- Steps: CSS counter. Circular badge `h-6 w-6 rounded-full bg-brand text-white`,
  `flex items-center justify-center shrink-0`, item `flex gap-3 leading-relaxed`.

### Auth (`Login`, `Signup`)

- Wrapper: `flex min-h-dvh w-full items-center justify-center` over `bg-canvas`.
  No app shell on these routes.
- Card: `w-full max-w-[420px] rounded-card border border-line-strong bg-surface px-8 py-10`
- Links: `text-brand no-underline hover:underline`.

---

## 4. Icons

1.0 uses Font Awesome via CDN. 2.0 already ships `lucide-react` — do **not** add Font Awesome.
Equivalents:

| Font Awesome (v1) | Lucide (v2) |
|---|---|
| `fa-home` | `Home` |
| `fa-magic` | `Sparkles` |
| `fa-history` | `History` |
| `fa-cog` | `Settings` |
| `fa-user-circle` | `CircleUserRound` |
| `fa-plus` | `Plus` |
| `fa-times` | `X` |
| `fa-arrow-right` | `ArrowRight` |

Default size `16`; `20` in the sidebar. Always `aria-hidden` when there is text alongside.

---

## 5. Affected files

**Edit**

```
src/index.css                        @theme tokens, base layer
index.html                           drop Fraunces; theme-color → #ffffff
src/components/layout/AppShell.tsx   three-zone grid
src/components/layout/Header.tsx     logo + user; the nav goes to the sidebar
src/components/layout/FilterSidebar.tsx  500px rail, toggle buttons
src/components/ui/Button.tsx         variants + rounded-card
src/components/ui/Chip.tsx
src/components/ui/Field.tsx
src/components/recipe/RecipeCard.tsx
src/components/recipe/StepList.tsx
src/components/recipe/IngredientLedger.tsx
src/pages/app/Feed.tsx               two-pane layout
src/pages/app/Generate.tsx           two-pane layout
src/pages/auth/Login.tsx
src/pages/auth/Signup.tsx
FRONTEND.md                          rewrite "Design direction" pointing here
```

**Create**

```
src/components/layout/Sidebar.tsx
src/assets/recipes_powered_by_gemini_logo.png   ← copy from the 1.0 repo
src/assets/no_recipe_image.png                  ← copy from the 1.0 repo
```

> **Amendment — files actually touched.** Every page and component that used the old tokens had to
> be migrated, not just the list above: with masa/comal/guajillo out of `@theme`, Tailwind stops
> generating those classes and the screens lose their styling. `TwoPaneLayout.tsx` was also added
> (Feed and Generate need the same grid, rail and dialog fallback), and `Footer.tsx` and `CostField`
> were removed.

**Do not touch**

```
src/queries/**          src/utils/filterArgs.ts     src/lib/supabase.ts
src/context/AuthProvider.tsx   src/router/**        src/types/database.ts
schema.md               recipe_search.sql           CLAUDE.2.0.md
```

> **Amendment.** `src/queries/**` and `src/utils/filterArgs.ts` were later opened up, for their
> user-facing strings only, when the project moved to English.

---

## 6. Verification

- [ ] `npm run build` and `npm run typecheck` pass.
- [ ] `npm test` stays green — `filterArgs.test.ts` must not have been touched.
- [ ] `grep -rn "masa\|comal\|guajillo\|tomatillo\|ceniza\|cal\b" src/` returns nothing.
- [ ] `grep -rn "\[#" src/` returns no arbitrary colors (`h-[180px]` is valid).
- [ ] `grep -rn "Fraunces\|font-display" src/ index.html` returns nothing.
- [ ] Header at 60px and sidebar at 240px, both pinned, with independent scrolling in the content.
- [ ] The active sidebar link is rose (`#fdecea`) with red text.
- [ ] `/generate` shows results on the left and the 500px filter rail on the right.
- [ ] ~~No card has `shadow-*`.~~ Superseded — cards carry `shadow-card`. See the amendment above.
- [ ] No accessibility regressions: skip-link alive, `aria-label` on icon buttons, visible focus on
      every control.
- [ ] ~~All copy stays in Spanish.~~ Superseded — the project is in English.
