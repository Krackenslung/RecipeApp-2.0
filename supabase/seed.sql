-- Catalog seed. Replayed by `supabase db reset` after every migration.
--
-- Names are in Spanish: this is data, not UI copy. The interface is English and
-- reads these through the catalog tables — see the language note in README.md.
--
-- Every id column here is `generated always as identity`, so nothing inserts an
-- explicit key; later inserts join back through the slug instead.


-- units — 11 -------------------------------------------------------------------
-- to_base_factor converts to g (mass) or ml (volume). A `count` has nothing to
-- convert to, which the ck_units_factor constraint enforces.

insert into catalog.units (code, name, dimension, to_base_factor, system) values
  ('g',     'gramo',      'mass',   1,        'metric'),
  ('kg',    'kilogramo',  'mass',   1000,     'metric'),
  ('ml',    'mililitro',  'volume', 1,        'metric'),
  ('l',     'litro',      'volume', 1000,     'metric'),
  ('tbsp',  'cucharada',  'volume', 15,       'metric'),
  ('tsp',   'cucharadita','volume', 5,        'metric'),
  ('cup',   'taza',       'volume', 240,      'metric'),
  ('oz',    'onza',       'mass',   28.35,    'imperial'),
  ('lb',    'libra',      'mass',   453.592,  'imperial'),
  ('pza',   'pieza',      'count',  null,     null),
  ('pizca', 'pizca',      'count',  null,     null);


-- ingredient categories — 8 ----------------------------------------------------

insert into catalog.ingredient_categories (slug, name) values
  ('verduras',          'Verduras'),
  ('frutas',            'Frutas'),
  ('carnes',            'Carnes'),
  ('pescados-mariscos', 'Pescados y mariscos'),
  ('lacteos',           'Lácteos'),
  ('granos-cereales',   'Granos y cereales'),
  ('especias',          'Especias y condimentos'),
  ('abarrotes',         'Abarrotes');


-- cuisines — 10 ----------------------------------------------------------------

insert into catalog.cuisines (slug, name, region) values
  ('mexicana',     'Mexicana',      'América'),
  ('italiana',     'Italiana',      'Europa'),
  ('japonesa',     'Japonesa',      'Asia'),
  ('china',        'China',         'Asia'),
  ('india',        'India',         'Asia'),
  ('tailandesa',   'Tailandesa',    'Asia'),
  ('mediterranea', 'Mediterránea',  'Europa'),
  ('espanola',     'Española',      'Europa'),
  ('francesa',     'Francesa',      'Europa'),
  ('americana',    'Americana',     'América');


-- diets — 9 --------------------------------------------------------------------
-- The RPC treats these as ALL, not ANY: selecting "vegana" and "keto" together
-- returns nothing, which is correct and is why the sidebar labels the group.

insert into catalog.diets (slug, name, description) values
  ('vegetariana',      'Vegetariana',       'Sin carne ni pescado'),
  ('vegana',           'Vegana',            'Sin ingredientes de origen animal'),
  ('sin-gluten',       'Sin gluten',        'Apta para celiaquía'),
  ('sin-lactosa',      'Sin lactosa',       'Sin lácteos'),
  ('keto',             'Keto',              'Muy baja en carbohidratos'),
  ('paleo',            'Paleo',             'Sin granos, lácteos ni procesados'),
  ('baja-en-calorias', 'Baja en calorías',  'Menos de 500 kcal por porción'),
  ('alta-en-proteina', 'Alta en proteína',  'Al menos 25 g de proteína por porción'),
  ('sin-azucar',       'Sin azúcar añadida','Sin azúcares agregados');


-- allergens — 9 ----------------------------------------------------------------

insert into catalog.allergens (slug, name) values
  ('gluten',       'Gluten'),
  ('lacteos',      'Lácteos'),
  ('huevo',        'Huevo'),
  ('frutos-secos', 'Frutos secos'),
  ('cacahuate',    'Cacahuate'),
  ('mariscos',     'Mariscos'),
  ('pescado',      'Pescado'),
  ('soya',         'Soya'),
  ('ajonjoli',     'Ajonjolí');


-- meal types — 6 ---------------------------------------------------------------

insert into catalog.meal_types (slug, name, sort_order) values
  ('desayuno', 'Desayuno', 1),
  ('almuerzo', 'Almuerzo', 2),
  ('comida',   'Comida',   3),
  ('cena',     'Cena',     4),
  ('snack',    'Snack',    5),
  ('postre',   'Postre',   6);


-- equipment — 7 ----------------------------------------------------------------
-- ALL semantics in the RPC: you either own the air fryer or you don't.

insert into catalog.equipment (slug, name) values
  ('estufa',       'Estufa'),
  ('horno',        'Horno'),
  ('licuadora',    'Licuadora'),
  ('batidora',     'Batidora'),
  ('olla-presion', 'Olla de presión'),
  ('air-fryer',    'Freidora de aire'),
  ('microondas',   'Microondas');


-- ingredients ------------------------------------------------------------------
-- A starter set, enough for the autocomplete and the cost/nutrition filters to
-- have something to work against. is_verified marks these as curated, which is
-- what separates them from whatever a generation adds later.
-- Values are per 100 g / 100 ml; cost is MXN.

insert into catalog.ingredients
  (slug, name, category_id, default_unit_id, kcal_per_100, protein_per_100,
   carbs_per_100, fat_per_100, avg_cost_per_100, is_verified)
select v.slug, v.name, c.category_id, u.unit_id,
       v.kcal, v.protein, v.carbs, v.fat, v.cost, true
from (values
  ('jitomate',      'Jitomate',          'verduras',          'g',   18,  0.9,  3.9,  0.2,  3.50),
  ('cebolla',       'Cebolla',           'verduras',          'g',   40,  1.1,  9.3,  0.1,  2.80),
  ('ajo',           'Ajo',               'verduras',          'g',  149,  6.4, 33.1,  0.5, 12.00),
  ('chile-serrano', 'Chile serrano',     'verduras',          'g',   32,  1.7,  6.7,  0.4,  6.00),
  ('aguacate',      'Aguacate',          'frutas',            'pza',160,  2.0,  8.5, 14.7, 18.00),
  ('limon',         'Limón',             'frutas',            'pza', 29,  1.1,  9.3,  0.3,  4.00),
  ('pechuga-pollo', 'Pechuga de pollo',  'carnes',            'g',  165, 31.0,  0.0,  3.6, 18.00),
  ('carne-molida',  'Carne molida de res','carnes',           'g',  250, 26.0,  0.0, 15.0, 22.00),
  ('camaron',       'Camarón',           'pescados-mariscos', 'g',   99, 24.0,  0.2,  0.3, 45.00),
  ('atun',          'Atún',              'pescados-mariscos', 'g',  132, 28.0,  0.0,  1.3, 15.00),
  ('huevo',         'Huevo',             'lacteos',           'pza',155, 13.0,  1.1, 11.0,  3.50),
  ('leche',         'Leche',             'lacteos',           'ml',  61,  3.2,  4.8,  3.3,  2.50),
  ('queso-fresco',  'Queso fresco',      'lacteos',           'g',  264, 17.0,  3.5, 20.0, 14.00),
  ('mantequilla',   'Mantequilla',       'lacteos',           'g',  717,  0.9,  0.1, 81.0, 18.00),
  ('arroz',         'Arroz',             'granos-cereales',   'g',  360,  6.7, 79.0,  0.6,  3.00),
  ('frijol-negro',  'Frijol negro',      'granos-cereales',   'g',  341, 21.6, 62.4,  1.4,  4.50),
  ('tortilla-maiz', 'Tortilla de maíz',  'granos-cereales',   'pza', 52,  1.4, 10.7,  0.7,  1.20),
  ('harina-trigo',  'Harina de trigo',   'granos-cereales',   'g',  364, 10.3, 76.3,  1.0,  2.20),
  ('pasta',         'Pasta',             'granos-cereales',   'g',  371, 13.0, 74.7,  1.5,  4.00),
  ('sal',           'Sal',               'especias',          'g',    0,  0.0,  0.0,  0.0,  0.50),
  ('pimienta',      'Pimienta negra',    'especias',          'g',  251, 10.4, 64.0,  3.3, 30.00),
  ('comino',        'Comino',            'especias',          'g',  375, 17.8, 44.2, 22.3, 28.00),
  ('aceite-oliva',  'Aceite de oliva',   'abarrotes',         'ml', 884,  0.0,  0.0,100.0, 25.00),
  ('azucar',        'Azúcar',            'abarrotes',         'g',  387,  0.0,100.0,  0.0,  2.00),
  ('salsa-soya',    'Salsa de soya',     'abarrotes',         'ml',  53,  8.1,  4.9,  0.6, 12.00),
  ('cacahuate',     'Cacahuate',         'abarrotes',         'g',  567, 25.8, 16.1, 49.2, 16.00)
) as v(slug, name, category_slug, unit_code, kcal, protein, carbs, fat, cost)
join catalog.ingredient_categories c on c.slug = v.category_slug
join catalog.units u on u.code = v.unit_code;


-- aliases ----------------------------------------------------------------------
-- What stops a generation creating "tomate rojo" beside the "jitomate" that is
-- already there. api/generate.ts resolves against this before inserting.

insert into catalog.ingredient_aliases (ingredient_id, alias, locale)
select i.ingredient_id, v.alias, 'es-MX'
from (values
  ('jitomate',      'tomate'),
  ('jitomate',      'tomate rojo'),
  ('cebolla',       'cebolla blanca'),
  ('chile-serrano', 'serrano'),
  ('pechuga-pollo', 'pollo'),
  ('carne-molida',  'molida de res'),
  ('frijol-negro',  'frijoles'),
  ('tortilla-maiz', 'tortillas'),
  ('aceite-oliva',  'aceite'),
  ('camaron',       'camarones'),
  ('cacahuate',     'maní')
) as v(ingredient_slug, alias)
join catalog.ingredients i on i.slug = v.ingredient_slug;


-- ingredient → allergen --------------------------------------------------------
-- This bridge is what lets a recipe's allergens be DERIVED rather than trusted
-- from whatever the model declared. search_recipes() reads it directly, and
-- optional ingredients still count: an allergy is not a preference.

insert into catalog.ingredient_allergens (ingredient_id, allergen_id)
select i.ingredient_id, a.allergen_id
from (values
  ('huevo',        'huevo'),
  ('leche',        'lacteos'),
  ('queso-fresco', 'lacteos'),
  ('mantequilla',  'lacteos'),
  ('harina-trigo', 'gluten'),
  ('pasta',        'gluten'),
  ('camaron',      'mariscos'),
  ('atun',         'pescado'),
  ('salsa-soya',   'soya'),
  ('salsa-soya',   'gluten'),
  ('cacahuate',    'cacahuate')
) as v(ingredient_slug, allergen_slug)
join catalog.ingredients i on i.slug = v.ingredient_slug
join catalog.allergens   a on a.slug = v.allergen_slug;
