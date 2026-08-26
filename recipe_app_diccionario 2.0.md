# Recipe_app — Diccionario de datos

Motor: **Microsoft SQL Server 2019+**
Archivo DDL: `recipe_app_schema.sql`

## Convenciones

| Regla | Decisión |
|---|---|
| Clave primaria | `INT IDENTITY` interna (índices angostos, joins rápidos) |
| ID público | `UNIQUEIDENTIFIER` en tablas expuestas por API — no revela volumen de datos |
| Texto | `NVARCHAR` (recetas multi-idioma) |
| Fechas | `DATETIME2(3)` en UTC vía `SYSUTCDATETIME()` |
| Borrado | Lógico (`deleted_at`) en tablas de contenido; físico en tablas puente |
| Unicidad con soft delete | Índice único filtrado `WHERE deleted_at IS NULL` |
| Booleanos | `BIT` con `DEFAULT` explícito |
| Dinero | `DECIMAL(10,2)` + columna `currency` |

## Esquemas

| Esquema | Contenido | Tablas |
|---|---|---|
| `auth` | Identidad, sesiones, permisos | 6 |
| `catalog` | Datos maestros que alimentan los filtros | 9 |
| `recipe` | La receta y todo lo que le pertenece | 10 |
| `ai` | Trazabilidad y control de costos de Gemini | 3 |
| `social` | Interacción entre usuarios | 9 |

---

## 1. Esquema `auth`

### `auth.users`
Cuenta de usuario. Soporta login local (`password_hash`) y OAuth (`password_hash` nulo).

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | `INT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | ID expuesto en la API |
| `email` | `NVARCHAR(320)` | Largo máximo real de un correo |
| `email_normalized` | computed `PERSISTED` | `LOWER(email)`, sobre esto va el índice único |
| `email_verified_at` | `DATETIME2(3)` | NULL = sin verificar |
| `password_hash` | `VARCHAR(255)` | bcrypt. NULL si entra por proveedor externo |
| `username` | `NVARCHAR(40)` | Único entre activos |
| `display_name` | `NVARCHAR(80)` | Nombre visible |
| `avatar_url` | `NVARCHAR(500)` | |
| `bio` | `NVARCHAR(500)` | |
| `locale` | `VARCHAR(10)` | Default `es-MX` |
| `is_active` | `BIT` | Suspensión administrativa |
| `failed_logins` | `SMALLINT` | Contador para bloqueo por fuerza bruta |
| `locked_until` | `DATETIME2(3)` | Bloqueo temporal |
| `last_login_at` | `DATETIME2(3)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | |

Índices: `UX_users_email` y `UX_users_username` (filtrados), `UX_users_public`.

### `auth.roles`
Catálogo fijo: `1 user`, `2 moderator`, `3 admin`.

| Columna | Tipo | Notas |
|---|---|---|
| `role_id` | `TINYINT` | PK, valores explícitos (no IDENTITY) |
| `code` | `VARCHAR(20)` | Único, es lo que valida el middleware |
| `display_name` | `NVARCHAR(50)` | |

### `auth.user_roles`
Puente N:N. PK compuesta `(user_id, role_id)`. Cascada al borrar usuario.

### `auth.user_identities`
Login federado (Google, GitHub, Apple).

| Columna | Tipo | Notas |
|---|---|---|
| `identity_id` | `INT IDENTITY` | PK |
| `user_id` | `INT` | FK → `users`, cascada |
| `provider` | `VARCHAR(30)` | |
| `provider_user_id` | `NVARCHAR(255)` | Único junto con `provider` |

### `auth.sessions`
Refresh tokens vivos. **Nunca guarda el token en claro.**

| Columna | Tipo | Notas |
|---|---|---|
| `session_id` | `BIGINT IDENTITY` | PK |
| `user_id` | `INT` | FK → `users`, cascada |
| `token_hash` | `BINARY(32)` | SHA-256 del refresh token. Único |
| `user_agent` | `NVARCHAR(300)` | Para la pantalla "sesiones activas" |
| `ip_address` | `VARCHAR(45)` | Cabe IPv6 |
| `issued_at` / `expires_at` / `revoked_at` | `DATETIME2(3)` | Revocar = escribir `revoked_at`, no borrar |

### `auth.one_time_tokens`
Verificación de correo y reseteo de contraseña en una sola tabla, discriminadas por `purpose` (`email_verify` \| `password_reset`). También guarda solo el hash. `consumed_at` evita reuso.

---

## 2. Esquema `catalog`

Todas las tablas de este esquema siguen el mismo patrón: `id` + `slug` (para URLs y para el front) + `name` + bandera de actividad cuando aplica.

### `catalog.units`
La tabla que hace posible escalar porciones y sumar nutrición de verdad.

| Columna | Tipo | Notas |
|---|---|---|
| `unit_id` | `SMALLINT IDENTITY` | PK |
| `code` | `VARCHAR(20)` | `g`, `ml`, `tbsp`, `cup`, `pza` |
| `dimension` | `VARCHAR(10)` | `mass` \| `volume` \| `count` |
| `to_base_factor` | `DECIMAL(18,6)` | Equivalencia a g o ml. NULL si es `count` |
| `system` | `VARCHAR(10)` | `metric` \| `imperial` |

Seed: 11 unidades.

### `catalog.ingredients`

| Columna | Tipo | Notas |
|---|---|---|
| `ingredient_id` | `INT IDENTITY` | PK |
| `slug` | `VARCHAR(100)` | Único |
| `name` | `NVARCHAR(120)` | |
| `category_id` | `SMALLINT` | FK → `ingredient_categories` |
| `default_unit_id` | `SMALLINT` | FK → `units` |
| `kcal_per_100`, `protein_per_100`, `carbs_per_100`, `fat_per_100` | `DECIMAL(8,2)` | Base para calcular nutrición de la receta |
| `avg_cost_per_100` | `DECIMAL(10,2)` | Base para el filtro de costo |
| `is_verified` | `BIT` | Distingue lo curado de lo que llegó por IA |

### `catalog.ingredient_aliases`
Sinónimos: "jitomate" → tomate rojo. Resuelve el autocomplete y evita que Gemini duplique ingredientes por escribirlos distinto.

| Columna | Tipo | Notas |
|---|---|---|
| `alias_id` | `INT IDENTITY` | PK |
| `ingredient_id` | `INT` | FK, cascada |
| `alias` | `NVARCHAR(120)` | Único por ingrediente |
| `locale` | `VARCHAR(10)` | Opcional |

### Catálogos simples

| Tabla | PK | Campos | Seed inicial |
|---|---|---|---|
| `catalog.cuisines` | `SMALLINT` | `slug`, `name`, `region`, `icon`, `is_active` | 10 cocinas |
| `catalog.diets` | `SMALLINT` | `slug`, `name`, `description`, `is_active` | 9 dietas |
| `catalog.allergens` | `SMALLINT` | `slug`, `name` | 9 alérgenos |
| `catalog.meal_types` | `SMALLINT` | `slug`, `name`, `sort_order` | 6 tiempos |
| `catalog.equipment` | `SMALLINT` | `slug`, `name` | 7 equipos |
| `catalog.ingredient_categories` | `SMALLINT` | `slug`, `name` | 8 categorías |
| `catalog.tags` | `INT` | `slug`, `name`, `usage_count` | — |

### `catalog.ingredient_allergens`
Puente N:N. Permite deducir los alérgenos de una receta desde sus ingredientes en vez de confiar en que la IA los declare.

---

## 3. Esquema `recipe`

### `recipe.recipes`
Tabla central.

| Columna | Tipo | Notas |
|---|---|---|
| `recipe_id` | `INT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | ID de API |
| `author_id` | `INT` | FK → `users`. **Nullable** = generada por el sistema |
| `title` | `NVARCHAR(160)` | |
| `slug` | `VARCHAR(180)` | Único entre no borradas |
| `summary` | `NVARCHAR(600)` | Texto de la tarjeta |
| `servings` | `SMALLINT` | CHECK 1–100 |
| `prep_minutes` / `cook_minutes` | `SMALLINT` | |
| `total_minutes` | computed `PERSISTED` | Suma de las dos. Indexable, alimenta el filtro de tiempo |
| `difficulty` | `TINYINT` | CHECK 1–3 |
| `est_cost` | `DECIMAL(10,2)` | Costo total estimado |
| `currency` | `CHAR(3)` | Default `MXN` |
| `cover_image_url` | `NVARCHAR(500)` | |
| `source_type` | `VARCHAR(20)` | `ai` \| `user` \| `imported` |
| `source_url` | `NVARCHAR(500)` | Si fue importada |
| `status` | `VARCHAR(20)` | `draft` \| `published` \| `archived` |
| `visibility` | `VARCHAR(20)` | `private` \| `unlisted` \| `public` |
| `language` | `VARCHAR(10)` | |
| `rating_avg` | `DECIMAL(3,2)` | **Desnormalizado**, mantenido por trigger |
| `rating_count` | `INT` | **Desnormalizado**, trigger |
| `save_count` | `INT` | **Desnormalizado**, trigger |
| `view_count` | `INT` | Incrementado por la app |
| `published_at` | `DATETIME2(3)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | |

Índices clave:
- `IX_recipes_feed` — `(status, visibility, published_at DESC)` con `INCLUDE` de las columnas de la tarjeta. Cubre el listado principal sin tocar la tabla base.
- `IX_recipes_time` — filtro de duración.
- `IX_recipes_author` — perfil del usuario.

> **Nota sobre FK:** `author_id` no lleva `ON DELETE CASCADE` a propósito. SQL Server rechaza múltiples rutas de cascada hacia la misma tabla y fallaría al crear `collection_recipes`. El borrado de usuario se maneja con soft delete desde la aplicación.

### `recipe.recipe_ingredients`

| Columna | Tipo | Notas |
|---|---|---|
| `recipe_ingredient_id` | `INT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascada |
| `ingredient_id` | `INT` | FK. **Nullable**: si Gemini devuelve algo sin catalogar, la receta se guarda igual |
| `raw_text` | `NVARCHAR(200)` | Texto original, siempre se conserva |
| `quantity` | `DECIMAL(10,3)` | CHECK > 0 |
| `unit_id` | `SMALLINT` | FK → `units` |
| `preparation` | `NVARCHAR(120)` | "picado finamente" |
| `is_optional` | `BIT` | |
| `group_label` | `NVARCHAR(60)` | "Para la salsa" |
| `sort_order` | `SMALLINT` | |

### `recipe.recipe_steps`

| Columna | Tipo | Notas |
|---|---|---|
| `step_id` | `INT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascada |
| `step_number` | `SMALLINT` | Único por receta |
| `instruction` | `NVARCHAR(1500)` | |
| `duration_minutes` | `SMALLINT` | Alimenta el temporizador del front |
| `image_url` | `NVARCHAR(500)` | |

### `recipe.recipe_nutrition`
Relación 1:1 con la receta, valores **por porción**. `is_estimated` distingue lo calculado de lo declarado.

Columnas: `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`, `is_estimated`, `calculated_at`.

### `recipe.recipe_images`
Galería. `url`, `alt_text`, `aspect`, `sort_order`.

### Tablas puente de filtros

| Tabla | PK compuesta | Índice inverso |
|---|---|---|
| `recipe.recipe_cuisines` | `(recipe_id, cuisine_id)` | `IX_rc_cuisine` |
| `recipe.recipe_diets` | `(recipe_id, diet_id)` | `IX_rd_diet` |
| `recipe.recipe_tags` | `(recipe_id, tag_id)` | `IX_rt_tag` |
| `recipe.recipe_meal_types` | `(recipe_id, meal_type_id)` | — |
| `recipe.recipe_equipment` | `(recipe_id, equipment_id)` | — |

Los índices inversos son los que hacen que "dame recetas italianas" no escanee la tabla completa.

---

## 4. Esquema `ai`

### `ai.generation_requests`
Una fila por llamada a Gemini. Sin esto no sabes cuánto te cuesta cada generación ni por qué fallan.

| Columna | Tipo | Notas |
|---|---|---|
| `request_id` | `BIGINT IDENTITY` | PK |
| `public_id` | `UNIQUEIDENTIFIER` | Para que el front consulte el estado |
| `user_id` | `INT` | FK → `users` |
| `prompt` | `NVARCHAR(MAX)` | |
| `filters_json` | `NVARCHAR(MAX)` | Snapshot exacto del sidebar. CHECK `ISJSON = 1` |
| `model` | `VARCHAR(60)` | Para comparar versiones |
| `status` | `VARCHAR(20)` | `pending` \| `success` \| `failed` \| `filtered` |
| `tokens_input` / `tokens_output` | `INT` | Costo real |
| `latency_ms` | `INT` | |
| `error_message` | `NVARCHAR(1000)` | |
| `created_at` / `completed_at` | `DATETIME2(3)` | |

### `ai.generation_results`
Respuesta cruda + receta persistida.

| Columna | Tipo | Notas |
|---|---|---|
| `result_id` | `BIGINT IDENTITY` | PK |
| `request_id` | `BIGINT` | FK, cascada |
| `recipe_id` | `INT` | FK. Nullable: hubo respuesta pero falló el parser |
| `raw_response` | `NVARCHAR(MAX)` | JSON original, para depurar |

### `ai.usage_quota`
Rate limiting persistido, no solo en memoria del proceso.

PK compuesta `(user_id, usage_date)`. Campos: `request_count`, `token_count`.

---

## 5. Esquema `social`

### `social.ratings`
PK compuesta `(user_id, recipe_id)` — **la combinación es la identidad**, lo que garantiza gratis un voto por usuario por receta. `rating` con CHECK 1–5.

### `social.comments`

| Columna | Tipo | Notas |
|---|---|---|
| `comment_id` | `BIGINT IDENTITY` | PK |
| `recipe_id` | `INT` | FK, cascada |
| `user_id` | `INT` | FK sin cascada (evita rutas múltiples) |
| `parent_id` | `BIGINT` | Auto-referencia, hilos de un nivel |
| `body` | `NVARCHAR(2000)` | |
| `created_at` / `updated_at` / `deleted_at` | `DATETIME2(3)` | Soft delete conserva el hilo |

### `social.saved_recipes`
PK `(user_id, recipe_id)` + `saved_at` + `notes`. Dispara el trigger que actualiza `recipes.save_count`.

### `social.collections` y `social.collection_recipes`
Colecciones con `public_id`, `is_public` y nombre único por usuario (índice filtrado). La tabla puente lleva `sort_order` para orden manual.

### `social.follows`
PK `(follower_id, followee_id)` con CHECK `follower_id <> followee_id`.

### `social.user_diet_preferences` y `social.user_allergen_preferences`
Precargan los filtros del sidebar cuando el usuario entra. Puentes simples contra `catalog`.

### `social.reports`
Moderación polimórfica.

| Columna | Tipo | Notas |
|---|---|---|
| `report_id` | `BIGINT IDENTITY` | PK |
| `reporter_id` | `INT` | FK → `users` |
| `target_type` | `VARCHAR(20)` | `recipe` \| `comment` \| `user` |
| `target_id` | `BIGINT` | Sin FK — es polimórfico, se valida en la app |
| `reason` / `details` | | |
| `status` | `VARCHAR(20)` | `open` \| `reviewing` \| `resolved` \| `dismissed` |
| `resolved_by` / `resolved_at` | | |

---

## 6. Triggers

| Trigger | Tabla | Qué hace |
|---|---|---|
| `TR_recipes_updated` | `recipe.recipes` | Refresca `updated_at` si el UPDATE no la trae |
| `TR_ratings_aggregate` | `social.ratings` | Recalcula `rating_avg` y `rating_count` |
| `TR_saved_aggregate` | `social.saved_recipes` | Recalcula `save_count` |

Los tres están escritos por conjuntos (`inserted` UNION `deleted`), no fila por fila.

## 7. Vistas

**`recipe.vw_recipe_cards`** — todo lo que necesita una tarjeta del listado en una sola consulta: datos de la receta, autor, calorías y las cocinas/dietas concatenadas con `STRING_AGG`. Ya filtra `deleted_at IS NULL`.

---

## Decisiones abiertas

1. **Reseñas vs calificaciones.** Ahora `ratings` (numérico) y `comments` (texto) son independientes. Si quieres reseñas tipo Amazon, hay que unirlas en una sola tabla.
2. **Costo total o por porción.** `est_cost` guarda el total; el filtro del sidebar tendría que dividir entre `servings` si prefieres el costo unitario.
3. **Multi-idioma.** Hoy solo existe la columna `language` en la receta. Traducción real requiere tablas `*_translations` para recetas, pasos e ingredientes.
