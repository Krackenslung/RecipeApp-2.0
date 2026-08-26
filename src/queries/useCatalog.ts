import { useQuery } from '@tanstack/react-query';
import { catalogDb, unwrap } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Cat = Database['catalog']['Tables'];
export type Cuisine = Cat['cuisines']['Row'];
export type Diet = Cat['diets']['Row'];
export type Allergen = Cat['allergens']['Row'];
export type MealType = Cat['meal_types']['Row'];
export type Equipment = Cat['equipment']['Row'];
export type Unit = Cat['units']['Row'];

/**
 * Cuisines, diets, allergens, units and meal types change on the order of
 * never. Fetched once at app start and never refetched.
 */
const FOREVER = { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false } as const;

export function useCuisines() {
  return useQuery({
    queryKey: ['catalog', 'cuisines'],
    queryFn: async () =>
      unwrap(
        await catalogDb
          .from('cuisines')
          .select('cuisine_id, slug, name, region, icon, is_active')
          .eq('is_active', true)
          .order('name'),
      ),
    ...FOREVER,
  });
}

export function useDiets() {
  return useQuery({
    queryKey: ['catalog', 'diets'],
    queryFn: async () =>
      unwrap(
        await catalogDb
          .from('diets')
          .select('diet_id, slug, name, description, is_active')
          .eq('is_active', true)
          .order('name'),
      ),
    ...FOREVER,
  });
}

export function useAllergens() {
  return useQuery({
    queryKey: ['catalog', 'allergens'],
    queryFn: async () =>
      unwrap(await catalogDb.from('allergens').select('allergen_id, slug, name').order('name')),
    ...FOREVER,
  });
}

export function useMealTypes() {
  return useQuery({
    queryKey: ['catalog', 'mealTypes'],
    queryFn: async () =>
      unwrap(
        await catalogDb
          .from('meal_types')
          .select('meal_type_id, slug, name, sort_order')
          .order('sort_order'),
      ),
    ...FOREVER,
  });
}

export function useEquipment() {
  return useQuery({
    queryKey: ['catalog', 'equipment'],
    queryFn: async () =>
      unwrap(await catalogDb.from('equipment').select('equipment_id, slug, name').order('name')),
    ...FOREVER,
  });
}

export function useUnits() {
  return useQuery({
    queryKey: ['catalog', 'units'],
    queryFn: async () =>
      unwrap(
        await catalogDb
          .from('units')
          .select('unit_id, code, name, dimension, to_base_factor, system')
          .order('unit_id'),
      ),
    ...FOREVER,
  });
}

/** Everything the sidebar needs, in one hook, so it can render before any recipe exists. */
export function useCatalog() {
  const cuisines = useCuisines();
  const diets = useDiets();
  const allergens = useAllergens();
  const mealTypes = useMealTypes();
  const equipment = useEquipment();

  return {
    cuisines: cuisines.data ?? [],
    diets: diets.data ?? [],
    allergens: allergens.data ?? [],
    mealTypes: mealTypes.data ?? [],
    equipment: equipment.data ?? [],
    isLoading:
      cuisines.isLoading ||
      diets.isLoading ||
      allergens.isLoading ||
      mealTypes.isLoading ||
      equipment.isLoading,
    error:
      cuisines.error ?? diets.error ?? allergens.error ?? mealTypes.error ?? equipment.error ?? null,
  };
}

/** A unit_id -> code lookup for the ingredient ledger. */
export function useUnitMap() {
  const { data } = useUnits();
  const map = new Map<number, string>();
  for (const u of data ?? []) map.set(u.unit_id, u.code);
  return map;
}
