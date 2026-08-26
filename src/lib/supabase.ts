import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

/**
 * The single client instance for the whole app. Multiple instances fight over
 * the session in storage, so nothing else may call createClient().
 *
 * Components never import this file — they call hooks from src/queries/.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Non-public schemas must be named explicitly through PostgREST. */
export const recipeDb = supabase.schema('recipe');
export const catalogDb = supabase.schema('catalog');
export const socialDb = supabase.schema('social');
export const appDb = supabase.schema('app');

type Result<T> = { data: T; error: { message: string } | null };

/**
 * supabase-js resolves rather than throws, so an unchecked error is
 * indistinguishable from an empty result — which is exactly how an RLS
 * misconfiguration hides. Every query hook funnels through here.
 *
 * The raw message goes to the console; screens show plain copy instead.
 */
function check<T>({ data, error }: Result<T>): T {
  if (error) {
    console.error('[supabase]', error);
    throw new Error(error.message);
  }
  return data;
}

/** For queries that must return something — lists, .single(), an RPC scalar. */
export function unwrap<T>(res: Result<T>): NonNullable<T> {
  const data = check(res);
  if (data == null) throw new Error('Expected a row, got none');
  return data as NonNullable<T>;
}

/** For `.maybeSingle()`, where "no row" is a real answer and not an error. */
export function unwrapMaybe<T>(res: Result<T>): T | null {
  return check(res) ?? null;
}
