# UI-MIGRATION.md — portar el look de Recipe App 1.0 a 2.0

Documento de estilo para Recipe App 2.0. **Reemplaza la sección "Design direction" de `FRONTEND.md`.**
Todo lo demás de `FRONTEND.md` (stack, rutas, `filterArgs`, TanStack Query, RLS) sigue vigente sin cambios.

## 0. Contexto: por qué existe este archivo

`FRONTEND.md` definió una dirección visual que se aleja deliberadamente de la 1.0:

> *"Cards have no shadows. A 1px `border-ceniza/20` and a flat `bg-cal`. Shadows on cards is the templated answer and it's what v1 looked like."*

Esa decisión queda revertida. El diseño de la 1.0 es el objetivo, no el antipatrón. Cualquier
instrucción de `FRONTEND.md` que contradiga este archivo pierde.

Lo que **no** cambia: el stack (Vite + React 19 + TS + Tailwind v4 CSS-first), el copy en
español (`es-MX`), las rutas, los hooks de `src/queries/`, y `src/utils/filterArgs.ts`.
Esto es un cambio de piel, no de arquitectura.

---

## 1. Tokens

Toda la paleta sale del CSS real de la 1.0 (`index.css`, `Layout.css`, `RecipeCard.css`, `auth.css`).
Va completa en `src/index.css` dentro de `@theme`, reemplazando los tokens masa/comal/guajillo.

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* Texto */
  --color-ink:          #1a1a1a;   /* títulos, nombres de receta */
  --color-body:         #555555;   /* párrafo, labels, nav inactivo */
  --color-muted:        #888888;   /* metadatos, footer de tarjeta */

  /* Superficies */
  --color-surface:      #ffffff;   /* header, sidebar, tarjetas, rail de filtros */
  --color-canvas:       #f8f9fa;   /* fondo del área de contenido */

  /* Bordes — tres pesos, no uno */
  --color-line:         #e9ecef;   /* chrome: header, sidebar, rails */
  --color-line-strong:  #dddddd;   /* borde de tarjeta */
  --color-hairline:     #f0f0f0;   /* separadores internos, fondo de chip */

  /* Acento */
  --color-brand:        #e74c3c;
  --color-brand-dark:   #c0392b;   /* hover del botón primario */
  --color-brand-soft:   #fdecea;   /* fondo del nav activo */
  --color-success:      #198754;   /* nivel de costo seleccionado */

  /* Radios */
  --radius-card:        8px;
  --radius-chip:        4px;

  /* Tipografía */
  --font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

**Reglas de uso**

- Cada token genera su utilidad automáticamente: `bg-surface`, `text-brand`, `border-line`,
  `rounded-card`. No escribas valores arbitrarios (`bg-[#e74c3c]`) — si un color se usa dos
  veces, va en `@theme`.
- `--color-brand` es el único acento. Aparece en: nav activo, botón primario, títulos de sección,
  viñetas de ingredientes, badges numerados de pasos. **La restricción de "un solo guajillo por
  pantalla" de `FRONTEND.md` queda eliminada** — la 1.0 usa el rojo con generosidad y así se ve bien.
- Nada de modo oscuro. La 1.0 declara `color-scheme: light` y no hay variantes `dark:`.

**Decisión pendiente — tipografía.**
La 1.0 no tenía fuente display; usaba el stack de sistema de Bootstrap. Aquí se propone Inter para
todo el cuerpo y conservar JetBrains Mono **solo** para cantidades, tiempos y costos, porque las
cifras tabulares alinean el ledger de ingredientes y eso no choca con el look de la 1.0.
**Fraunces se elimina.** Si prefieres fidelidad total a la 1.0, quita también el mono y borra los
`<link>` de Google Fonts en `index.html`.

---

## 2. Estructura del shell

El cambio más grande. La 2.0 hoy tiene nav horizontal + `<main class="mx-auto max-w-7xl">`.
La 1.0 usa un grid de app de tres zonas y es lo que se ve en la captura de referencia.

### 2.1 `AppShell.tsx` — grid de tres zonas

Medidas exactas de `Layout.css` de la 1.0:

| Zona | Medida | Estilo |
|---|---|---|
| Header | `60px`, ancho completo (`grid-column: 1 / -1`) | `bg-surface`, `border-b border-line`, `sticky top-0 z-50`, padding lateral `1.5rem` |
| Sidebar | `240px`, columna 1 | `bg-surface`, `border-r border-line`, `sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto` |
| Contenido | `1fr`, columna 2 | `bg-canvas`, padding `2rem`, `overflow-y-auto` |

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

Se elimina el `max-w-7xl` centrado. El contenido llena la columna. Se conserva el
skip-link `Saltar al contenido` que ya existe.

### 2.2 Sidebar de navegación

Reemplaza el nav horizontal del `Header` actual. Los ítems se mueven al sidebar; el menú
desplegable de perfil se queda en el header.

- Contenedor: `flex flex-col gap-1 p-3` (`padding: 1rem 0.75rem` en la 1.0).
- Link: `flex items-center gap-2 rounded-card px-4 py-2.5 text-body hover:no-underline`
- Link activo: `bg-brand-soft text-brand` — este es el rosa pálido de la captura.
- Ítems: Home (`/`), Generar receta (`/generate`), Historial (`/me`), Ajustes (`/settings`),
  más los de 2.0 que no existían en la 1.0 (Colecciones, Guardadas). Copy en español.

### 2.3 Header

- Izquierda: logo `recipes_powered_by_gemini_logo.png` a `h-9` (36px). Está en el repo de la 1.0
  en `frontend/src/assets/`; cópialo a `src/assets/`. Sustituye al lockup `ChefHat` + "Recetas".
- Derecha: `flex items-center gap-2.5 text-body` — ícono de usuario, nombre, y botón
  **Cerrar sesión** con contorno rojo (`variant="danger"`, `size="sm"`).

### 2.4 Vista de generación / feed — dos paneles

De `.generate-layout` en la 1.0. Aplica a `/generate` y a `/` (el feed también lleva filtros).

```
grid-cols-[1fr_500px]
grid-rows-[1fr_auto]
áreas:  "resultados  filtros"
        "footer      filtros"
```

- El `<main>` pierde su padding en estas rutas (`.app-content:has(.generate-layout){padding:0}`).
  En React resuélvelo con una prop en la ruta o una clase condicional, no con `:has()`.
- Panel de resultados: `overflow-y-auto p-12` (`3rem`), tarjetas apiladas en columna con `gap-5`.
- Rail de filtros: `w-[500px] overflow-y-auto border-l border-line bg-surface px-3 py-4`,
  altura completa, scroll independiente.
- Debajo de `lg` los paneles se apilan; el rail pasa a un `<dialog>` (ya tienes `useDialog`).

---

## 3. Recetas de clases por componente

Estas cadenas viven **solo** dentro del componente que las define. Ninguna página escribe
clases de botón a mano — es lo que evita que deriven entre archivos.

### `ui/Button.tsx`

Sustituye el mapa `VARIANTS` actual. Nota el cambio de `rounded-none` a `rounded-card`.

```ts
const BASE = 'inline-flex items-center justify-center gap-2 rounded-card font-medium ' +
             'transition-colors disabled:cursor-not-allowed disabled:opacity-70 select-none';

const VARIANTS = {
  primary:   'bg-brand text-white hover:bg-brand-dark',
  secondary: 'border border-line-strong bg-surface text-body hover:bg-hairline',
  ghost:     'text-body hover:text-ink',
  danger:    'border border-brand text-brand hover:bg-brand hover:text-white',
  success:   'bg-success text-white',   // nivel de costo seleccionado
};

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};
```

Botones de toggle de filtro (Costo, Dificultad): `size="sm"`, `secondary` sin seleccionar.
Seleccionado → `success` para Costo, `primary` para Dificultad. Es el comportamiento exacto
de la 1.0 y explica los dos colores distintos en la captura.

### `ui/Chip.tsx` — tags de receta y de filtro

- Tag de receta: `rounded-chip bg-hairline px-2 py-0.5 text-xs text-body whitespace-nowrap`
- Tag de filtro seleccionado (removible): mismo cuerpo + ícono `X` de lucide a `12px`,
  `cursor-pointer`, con `aria-label="Quitar {tag}"`.

### `ui/Field.tsx` — inputs, selects, textarea

- Label: `mb-1.5 block font-semibold text-body`
- Control: `w-full rounded-card border border-line-strong bg-surface px-3 py-2 text-body
  placeholder:text-muted focus:border-line-strong focus:outline-none`
  La 1.0 anula explícitamente el glow de foco de Bootstrap (`box-shadow: none`).
- Grupo input + botón (autocompletar de ingredientes): input con esquinas derechas rectas,
  botón `+` pegado con esquinas izquierdas rectas. Bordes contiguos, sin doble línea.
- Dropdown de sugerencias: `absolute z-30 w-full max-h-40 overflow-y-auto rounded-card
  border border-line-strong bg-surface`, ítems `px-3 py-2 text-body hover:bg-hairline`.

### `recipe/RecipeCard.tsx`

De `RecipeCard.css`. **Sin sombra** — la 1.0 tampoco la tenía; se distingue por borde.

- Contenedor: `flex flex-col overflow-hidden rounded-card border border-line-strong
  bg-surface cursor-pointer`
- Imagen: `h-[180px] w-full object-cover` (variante detalle: `h-[260px]`).
  Fallback `no_recipe_image.png`, también en los assets de la 1.0.
- Cuerpo: `flex flex-1 flex-col gap-2 p-4`
- Nombre: `m-0 leading-tight text-ink line-clamp-2`
- Footer: `flex justify-between border-t border-hairline px-4 py-2.5 text-muted`

### Detalle de receta

- Título de sección: `uppercase text-brand mb-1.5` (INGREDIENTES, PREPARACIÓN).
- Ingredientes: `list-none p-0 m-0 flex flex-col gap-1`, con `::before` de contenido `•`
  en `text-brand` y `mr-2`. Se puede conservar el ledger de dos columnas con cantidades en
  mono — es compatible con el estilo de la 1.0 y no lo contradice.
- Pasos: contador CSS. Badge circular `h-6 w-6 rounded-full bg-brand text-white`,
  `flex items-center justify-center shrink-0`, ítem `flex gap-3 leading-relaxed`.

### Auth (`Login`, `Signup`)

- Wrapper: `flex min-h-dvh w-full items-center justify-center` sobre `bg-canvas`.
  Sin shell de app en estas rutas.
- Tarjeta: `w-full max-w-[420px] rounded-card border border-line-strong bg-surface px-8 py-10`
- Enlaces: `text-brand no-underline hover:underline`.

---

## 4. Íconos

La 1.0 usa Font Awesome vía CDN. La 2.0 ya trae `lucide-react` — **no** añadas Font Awesome.
Equivalencias:

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

Tamaño por defecto `16`; `20` en el sidebar. Siempre `aria-hidden` cuando hay texto al lado.

---

## 5. Archivos afectados

**Editar**

```
src/index.css                        tokens @theme, capa base
index.html                           quitar Fraunces; theme-color → #ffffff
src/components/layout/AppShell.tsx   grid de tres zonas
src/components/layout/Header.tsx     logo + usuario; el nav se va al sidebar
src/components/layout/FilterSidebar.tsx  rail de 500px, botones de toggle
src/components/ui/Button.tsx         variantes + rounded-card
src/components/ui/Chip.tsx
src/components/ui/Field.tsx
src/components/recipe/RecipeCard.tsx
src/components/recipe/StepList.tsx
src/components/recipe/IngredientLedger.tsx
src/pages/app/Feed.tsx               layout de dos paneles
src/pages/app/Generate.tsx           layout de dos paneles
src/pages/auth/Login.tsx
src/pages/auth/Signup.tsx
FRONTEND.md                          reescribir "Design direction" apuntando aquí
```

**Crear**

```
src/components/layout/Sidebar.tsx
src/assets/recipes_powered_by_gemini_logo.png   ← copiar del repo 1.0
src/assets/no_recipe_image.png                  ← copiar del repo 1.0
```

**No tocar**

```
src/queries/**          src/utils/filterArgs.ts     src/lib/supabase.ts
src/context/AuthProvider.tsx   src/router/**        src/types/database.ts
schema.md               recipe_search.sql           CLAUDE.2.0.md
```

---

## 6. Verificación

- [ ] `npm run build` y `npm run typecheck` pasan.
- [ ] `npm test` sigue verde — `filterArgs.test.ts` no debe haberse tocado.
- [ ] `grep -rn "masa\|comal\|guajillo\|tomatillo\|ceniza\|cal\b" src/` no devuelve nada.
- [ ] `grep -rn "\[#" src/` no devuelve colores arbitrarios (`h-[180px]` sí es válido).
- [ ] `grep -rn "Fraunces\|font-display" src/ index.html` no devuelve nada.
- [ ] Header a 60px y sidebar a 240px, ambos sticky, con scroll independiente en contenido.
- [ ] El link activo del sidebar sale rosa (`#fdecea`) con texto rojo.
- [ ] `/generate` muestra resultados a la izquierda y el rail de filtros de 500px a la derecha.
- [ ] Ninguna tarjeta tiene `shadow-*`.
- [ ] Sin regresiones de accesibilidad: skip-link vivo, `aria-label` en los botones de icono,
      foco visible en todos los controles.
- [ ] Todo el copy sigue en español.
