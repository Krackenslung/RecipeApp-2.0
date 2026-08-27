/** Display helpers. Numbers in a recipe are data — they all render in mono. */

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function formatCost(value: number | null, currency = 'MXN'): string {
  if (value == null) return '—';
  if (currency === 'MXN') return money.format(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMinutes(total: number | null): string {
  if (total == null) return '—';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

export function formatDifficulty(d: number | null): string {
  return d == null ? '—' : (DIFFICULTY_LABEL[d] ?? '—');
}

export function formatRating(avg: number | null): string {
  return avg == null ? '—' : avg.toFixed(1);
}

/**
 * Quantities scale with servings, so they stop being round. Keep at most two
 * decimals and drop trailing zeros — "1.5", not "1.50"; "375", not "375.00".
 */
export function formatQuantity(value: number | null): string {
  if (value == null) return '';
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Seconds elapsed, as m:ss. The generation screen shows real time, not a fake bar. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** Split "Mexicana, Yucateca" from the view's string_agg back into chips. */
export function splitAgg(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
