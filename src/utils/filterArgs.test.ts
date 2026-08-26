import { describe, expect, it } from 'vitest';
import {
  clearConstraint,
  countActive,
  EMPTY_FILTERS,
  narrowestConstraint,
  PAGE_SIZE,
  toRpcArgs,
  type RecipeFilters,
} from './filterArgs';

const f = (over: Partial<RecipeFilters> = {}): RecipeFilters => ({ ...EMPTY_FILTERS, ...over });

describe('toRpcArgs', () => {
  it('sends only pagination when nothing is set', () => {
    expect(toRpcArgs(f())).toEqual({ p_offset: 0, p_limit: PAGE_SIZE });
  });

  it('omits empty arrays rather than sending null', () => {
    const args = toRpcArgs(f());
    for (const key of [
      'p_include_ingredients',
      'p_exclude_ingredients',
      'p_cuisines',
      'p_diets',
      'p_meal_types',
      'p_exclude_allergens',
      'p_equipment',
    ]) {
      expect(args).not.toHaveProperty(key);
    }
  });

  it('sends arrays of ids when set', () => {
    const args = toRpcArgs(f({ includeIngredients: [3, 9], cuisines: [1] }));
    expect(args.p_include_ingredients).toEqual([3, 9]);
    expect(args.p_cuisines).toEqual([1]);
  });

  it('treats null scalars as no constraint and 0 as a real one', () => {
    expect(toRpcArgs(f({ maxMinutes: null }))).not.toHaveProperty('p_max_minutes');
    expect(toRpcArgs(f({ maxMinutes: 0 })).p_max_minutes).toBe(0);
  });

  it('pairs cost with the per-serving flag, and omits both when cost is unset', () => {
    const withCost = toRpcArgs(f({ maxCost: 120, costPerServing: true }));
    expect(withCost.p_max_cost).toBe(120);
    expect(withCost.p_cost_per_serving).toBe(true);

    const noCost = toRpcArgs(f({ costPerServing: true }));
    expect(noCost).not.toHaveProperty('p_max_cost');
    expect(noCost).not.toHaveProperty('p_cost_per_serving');
  });

  it('trims search and drops it when blank', () => {
    expect(toRpcArgs(f({ search: '  pozole ' })).p_search).toBe('pozole');
    expect(toRpcArgs(f({ search: '   ' }))).not.toHaveProperty('p_search');
  });

  it('omits the default sort', () => {
    expect(toRpcArgs(f({ sort: 'recent' }))).not.toHaveProperty('p_sort');
    expect(toRpcArgs(f({ sort: 'cheap' })).p_sort).toBe('cheap');
  });

  it('paginates by offset, page size fixed', () => {
    expect(toRpcArgs(f(), 0).p_offset).toBe(0);
    expect(toRpcArgs(f(), 2).p_offset).toBe(2 * PAGE_SIZE);
    expect(toRpcArgs(f(), 2).p_limit).toBe(PAGE_SIZE);
  });

  it('only sends p_author_id when the screen supplies one', () => {
    expect(toRpcArgs(f())).not.toHaveProperty('p_author_id');
    expect(toRpcArgs(f(), 0, 'uuid-1').p_author_id).toBe('uuid-1');
  });

  it('never emits a null value for any key', () => {
    const args = toRpcArgs(
      f({ maxMinutes: 30, maxCalories: 500, maxDifficulty: 2, minRating: 4, search: 'x' }),
      1,
      'uuid-1',
    );
    for (const value of Object.values(args)) expect(value).not.toBeNull();
  });
});

describe('countActive', () => {
  it('is zero for empty filters', () => {
    expect(countActive(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each constrained dimension once', () => {
    expect(countActive(f({ cuisines: [1, 2], maxMinutes: 30, search: 'mole' }))).toBe(3);
  });

  it('does not count costPerServing on its own', () => {
    expect(countActive(f({ costPerServing: true }))).toBe(0);
  });
});

describe('narrowestConstraint', () => {
  it('returns null when nothing is set', () => {
    expect(narrowestConstraint(EMPTY_FILTERS)).toBeNull();
  });

  it('blames the ingredient list before anything else', () => {
    const c = narrowestConstraint(f({ includeIngredients: [1, 2, 3, 4], maxMinutes: 30 }));
    expect(c?.key).toBe('includeIngredients');
    expect(c?.message).toContain('4');
  });

  it('blames a multi-diet selection, which the RPC treats as ALL', () => {
    expect(narrowestConstraint(f({ diets: [1, 2] }))?.key).toBe('diets');
  });
});

describe('clearConstraint', () => {
  it('resets one key and leaves the rest alone', () => {
    const before = f({ includeIngredients: [1, 2], maxMinutes: 30 });
    const after = clearConstraint(before, 'includeIngredients');
    expect(after.includeIngredients).toEqual([]);
    expect(after.maxMinutes).toBe(30);
  });
});
