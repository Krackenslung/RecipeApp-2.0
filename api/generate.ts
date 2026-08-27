/**
 * THE ONLY server code in the project.
 *
 * It exists for one reason: GEMINI_API_KEY cannot ship to a browser. Everything
 * else in this app talks to Postgres directly through PostgREST, with RLS doing
 * the authorization. This file is the exception, and it is the one place
 * service_role appears — which is why the first thing it does is establish who
 * the caller is, and why it never touches service_role before that has
 * succeeded. Using it earlier would hand any anonymous request the whole
 * database.
 *
 * The client half lives in src/queries/useGeneration.ts and expects:
 *   200  { data: { request_id } }
 *   429  { error, quota_remaining }
 *   4xx/5xx { error }
 * The { data } / { error } shape matches supabase-js so callers handle both
 * paths identically.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

const MODEL = 'gemini-2.5-flash';
const DAILY_LIMIT = 20;
/**
 * These three are one decision, not three, and they have to stay ordered:
 *
 *   GEMINI_TIMEOUT_MS  <  BUDGET_MS  <  maxDuration in vercel.json
 *
 * The old 60s Gemini timeout was equal to the function's own ceiling, so the
 * process was killed before its timeout could fire and gen_fail never ran —
 * which is how a request ends up pending forever with no error_message. The
 * budget leaves room to *record* the failure, which is the part that matters.
 */
const MAX_DURATION_S = 60;                          // must match vercel.json
const BUDGET_MS = (MAX_DURATION_S - 10) * 1_000;   // whole background job
const GEMINI_TIMEOUT_MS = 45_000; // one attempt
const PERSIST_RESERVE_MS = 8_000; // never start an attempt without this much left
const MAX_ATTEMPTS = 3;

type Db = ReturnType<ReturnType<typeof createClient>['schema']>;

/**
 * Structurally the client's RecipeFilters. Declared here rather than imported
 * from src/: this function is bundled separately, and reaching into the client
 * tree would drag the browser Supabase client and its env-var assertions into a
 * server bundle that has neither.
 */
type Filters = {
  includeIngredients?: number[];
  excludeIngredients?: number[];
  cuisines?: number[];
  diets?: number[];
  mealTypes?: number[];
  excludeAllergens?: number[];
  equipment?: number[];
  maxMinutes?: number | null;
  maxCost?: number | null;
  costPerServing?: boolean;
  maxCalories?: number | null;
  maxDifficulty?: number | null;
  minServings?: number | null;
  maxServings?: number | null;
  search?: string;
};

/** What Gemini is required to return. Enforced by responseSchema, not by hope. */
const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['recipe', 'ingredients', 'steps'],
  properties: {
    recipe: {
      type: 'object',
      required: ['title', 'servings'],
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        servings: { type: 'integer' },
        prep_minutes: { type: 'integer' },
        cook_minutes: { type: 'integer' },
        difficulty: { type: 'integer' },
        est_cost: { type: 'number' },
        currency: { type: 'string' },
        language: { type: 'string' },
      },
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        required: ['raw_text', 'name'],
        properties: {
          raw_text: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit_code: { type: 'string' },
          preparation: { type: 'string' },
          is_optional: { type: 'boolean' },
          group_label: { type: 'string' },
          sort_order: { type: 'integer' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['step_number', 'instruction'],
        properties: {
          step_number: { type: 'integer' },
          instruction: { type: 'string' },
          duration_minutes: { type: 'integer' },
        },
      },
    },
    nutrition: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        fiber_g: { type: 'number' },
        sugar_g: { type: 'number' },
        sodium_mg: { type: 'number' },
      },
    },
    cuisines: { type: 'array', items: { type: 'string' } },
    diets: { type: 'array', items: { type: 'string' } },
    meal_types: { type: 'array', items: { type: 'string' } },
    equipment: { type: 'array', items: { type: 'string' } },
  },
} as const;

const env = (name: string, fallback?: string) => process.env[name] ?? fallback;

/* ---------------------------------------------------------------------------
 * TEMPORARY — diagnostic instrumentation.
 *
 * This block makes the function report its real failure instead of a generic
 * message. Remove it, and restore the generic 500s, once /generate works: a raw
 * error names columns, constraints and function signatures, which is exactly
 * what the generic messages exist to withhold.
 *
 * Nothing here can print a secret. Every string that leaves the function goes
 * through redact() first, which blanks the literal value of each key. The
 * Gemini key was already out of reach — it travels in the x-goog-api-key
 * header, never in the URL, so it cannot appear in a fetch error.
 * ------------------------------------------------------------------------- */

const SECRETS = (): string[] =>
  [
    process.env.GEMINI_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
  ].filter((v): v is string => Boolean(v) && v!.length > 8);

function redact(text: unknown): string {
  let out = typeof text === 'string' ? text : String(text ?? '');
  for (const secret of SECRETS()) out = out.split(secret).join('[redacted]');
  return out;
}

/** Checkpoint log. The last one printed before a failure is where it died. */
function step(name: string, detail?: Record<string, unknown>) {
  console.log(`[generate] step: ${name}`, detail ? redact(JSON.stringify(detail)) : '');
}

/**
 * Slugs are generated here, not by the model: recipes.slug carries a unique
 * index and a model asked twice for "pozole rojo" will happily answer with the
 * same title both times.
 */
function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'receta'}-${suffix}`;
}

function buildPrompt(prompt: string, filters: Filters): string {
  const lines: string[] = [
    'Eres un chef que devuelve recetas estructuradas en JSON.',
    'Responde SOLO con el JSON del esquema. Sin markdown, sin explicaciones.',
    '',
    'Reglas:',
    '- Los nombres de ingredientes en singular y en español ("jitomate", no "Jitomates").',
    '- unit_code debe ser uno de: g, kg, ml, l, tbsp, tsp, cup, oz, lb, pza, pizca.',
    '- cuisines, diets, meal_types y equipment son slugs del catálogo, en minúsculas.',
    '- est_cost es el total estimado de la receta en MXN, no por porción.',
    '- difficulty va de 1 (fácil) a 3 (difícil).',
  ];

  if (prompt.trim()) lines.push('', `Petición del usuario: ${prompt.trim()}`);

  const c = describeFilters(filters);
  if (c.length) lines.push('', 'Restricciones que la receta DEBE cumplir:', ...c);

  return lines.join('\n');
}

/**
 * The filters reach the model as prose. They are also stored verbatim as
 * filters_json on the request row — that column is the audit trail, this is the
 * lossy version the model reads.
 */
function describeFilters(f: Filters): string[] {
  const out: string[] = [];
  const push = (v: unknown, text: string) => {
    if (Array.isArray(v) ? v.length : v !== null && v !== undefined) out.push(`- ${text}`);
  };

  push(f.maxMinutes, `Tiempo total máximo: ${f.maxMinutes} minutos.`);
  push(f.maxCalories, `Máximo ${f.maxCalories} kcal por porción.`);
  push(f.maxDifficulty, `Dificultad máxima: ${f.maxDifficulty} de 3.`);
  push(f.minServings, `Al menos ${f.minServings} porciones.`);
  push(f.maxServings, `No más de ${f.maxServings} porciones.`);
  if (f.maxCost != null) {
    out.push(
      `- Costo máximo: ${f.maxCost} MXN ${f.costPerServing ? 'por porción' : 'en total'}.`,
    );
  }
  if (f.search?.trim()) out.push(`- Debe parecerse a: ${f.search.trim()}`);

  // The ids are catalog keys the model has never seen, so they are sent as a
  // count rather than as numbers it would only hallucinate names for. The real
  // enforcement is the filter on the way back out through search_recipes().
  push(f.includeIngredients, `Debe incluir los ${f.includeIngredients?.length} ingredientes pedidos.`);
  push(f.excludeIngredients, `Debe excluir por completo ${f.excludeIngredients?.length} ingrediente(s).`);
  push(f.excludeAllergens, `Debe evitar ${f.excludeAllergens?.length} alérgeno(s).`);

  return out;
}

type GeminiCall = {
  parsed: unknown;
  raw: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
};

/**
 * Retries on 503 and 429 only. A 400 means the request is malformed and will be
 * malformed the second time too; retrying it just spends the user's latency
 * budget to arrive at the same answer.
 */
async function callGemini(apiKey: string, prompt: string, deadline: number): Promise<GeminiCall> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  let lastError = 'The model did not respond.';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Three 45s attempts do not fit in a 60s function. Each attempt gets what
    // is actually left, and none starts unless there is still time to write the
    // outcome down afterwards.
    const remaining = deadline - Date.now();
    if (remaining <= PERSIST_RESERVE_MS) {
      throw new GenerationFailure('failed', 'Ran out of time before the model answered.');
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(GEMINI_TIMEOUT_MS, remaining - PERSIST_RESERVE_MS),
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            // responseSchema plus this mime type is what makes the reply parse
            // with JSON.parse and no repair step.
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.7,
          },
        }),
      });

      if (res.status === 503 || res.status === 429) {
        lastError = `The model is busy (${res.status}).`;
        if (attempt < MAX_ATTEMPTS && deadline - Date.now() > PERSIST_RESERVE_MS + 2_000) {
          await new Promise((r) => setTimeout(r, attempt * 1_000));
          continue;
        }
        throw new GenerationFailure('busy', lastError);
      }

      if (!res.ok) {
        // Body may carry the key back in an error echo, so it is never returned
        // to the caller and never logged verbatim.
        throw new GenerationFailure('failed', `The model rejected the request (${res.status}).`);
      }

      const raw = (await res.json()) as Record<string, any>;
      const text: string | undefined = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
      const finish: string | undefined = raw?.candidates?.[0]?.finishReason;

      if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || raw?.promptFeedback?.blockReason) {
        throw new GenerationFailure('filtered', 'The model declined this request.', raw);
      }
      if (!text) {
        throw new GenerationFailure('failed', 'The model returned an empty response.', raw);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GenerationFailure('failed', 'The model returned malformed JSON.', raw);
      }

      return {
        parsed,
        raw,
        tokensIn: raw?.usageMetadata?.promptTokenCount ?? null,
        tokensOut: raw?.usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (e) {
      if (e instanceof GenerationFailure) throw e;
      // AbortError and network faults land here.
      lastError = 'The model timed out.';
      if (attempt >= MAX_ATTEMPTS || deadline - Date.now() <= PERSIST_RESERVE_MS + 2_000) {
        throw new GenerationFailure('failed', lastError);
      }
      await new Promise((r) => setTimeout(r, attempt * 1_000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new GenerationFailure('failed', lastError);
}

class GenerationFailure extends Error {
  constructor(
    readonly status: 'failed' | 'filtered' | 'busy',
    message: string,
    readonly raw?: unknown,
  ) {
    super(message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await run(req, res);
  } catch (err) {
    // TEMPORARY — see the diagnostic block above.
    const e = err as { message?: string; stack?: string };
    console.error('generate failed:', redact(e?.message), redact(e?.stack));
    if (!res.headersSent) {
      res.status(500).json({ error: redact(e?.message) || 'Unhandled error.' });
    }
  }
}

async function run(req: VercelRequest, res: VercelResponse) {
  // Explicit, so that a 405 from here is distinguishable from the one Vercel
  // returns when a POST falls through the SPA rewrite onto index.html.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const supabaseUrl = env('SUPABASE_URL', env('VITE_SUPABASE_URL'));
  const anonKey = env('SUPABASE_ANON_KEY', env('VITE_SUPABASE_ANON_KEY'));
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const geminiKey = env('GEMINI_API_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey || !geminiKey) {
    // Which one is missing goes to the server log, never to the response: the
    // names alone tell an attacker how this is wired.
    console.error('[generate] missing env', {
      supabaseUrl: Boolean(supabaseUrl),
      anonKey: Boolean(anonKey),
      serviceKey: Boolean(serviceKey),
      geminiKey: Boolean(geminiKey),
    });
    // TEMPORARY — the names of the missing variables, never their values.
    const missing = [
      !supabaseUrl && 'SUPABASE_URL / VITE_SUPABASE_URL',
      !anonKey && 'SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY',
      !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
      !geminiKey && 'GEMINI_API_KEY',
    ].filter(Boolean);
    return res
      .status(500)
      .json({ error: `The generator is not configured. Missing: ${missing.join(', ')}` });
  }

  // --- 1. Who is calling ------------------------------------------------------
  // This is a public URL protected by nothing else. Everything below depends on
  // this block having succeeded.
  step('env ok');

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to generate recipes.' });

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData?.user) {
    console.error('[generate] token', userError);
    return res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
  const userId = userData.user.id;
  step('caller verified', { userId });

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as {
    prompt?: string;
    filters?: Filters;
  } | null;

  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const filters: Filters = body?.filters ?? {};

  // Only now, with the caller established, does service_role come out.
  step('input parsed', { promptLength: prompt.length, filterKeys: Object.keys(filters).length });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = admin.schema('recipe');

  // --- 2 & 3. Quota and the request row, in one statement ---------------------
  const { data: begun, error: beginError } = await db.rpc('gen_begin', {
    p_user_id: userId,
    p_prompt: prompt,
    p_filters: filters,
    p_model: MODEL,
    p_daily_limit: DAILY_LIMIT,
  });

  if (beginError || !begun) {
    console.error('[generate] gen_begin', beginError);
    // TEMPORARY — the raw PostgREST error. A missing function reads as
    // PGRST202 here, which is the difference between "not deployed" and
    // "deployed and broken".
    return res.status(500).json({
      error: `gen_begin failed: ${redact(beginError?.message)}`,
      code: beginError?.code ?? null,
      hint: redact(beginError?.hint ?? ''),
    });
  }

  const begin = begun as { over_quota: boolean; remaining: number; request_id?: string };

  if (begin.over_quota) {
    // The client cannot read ai.usage_quota, so the remaining count only ever
    // reaches it here.
    return res.status(429).json({
      error: 'You’ve hit your generation limit for today.',
      quota_remaining: 0,
    });
  }

  const requestId = begin.request_id!;
  step('request row open', { requestId, remaining: begin.remaining });

  // The screen wants a request_id in under a second. Everything past this point
  // is reported through ai.generation_requests, which the client polls via
  // recipe.get_generation_status().
  res.status(200).json({ data: { request_id: requestId }, quota_remaining: begin.remaining });

  // Vercel freezes the process the moment the response is flushed, so the work
  // below used to be cut off mid-flight: the row stayed 'pending' forever, with
  // no tokens and no error_message, because neither gen_succeed nor gen_fail
  // ever ran. waitUntil is what keeps the instance alive for it.
  //
  // The promise is passed already invoked, and deliberately not awaited —
  // awaiting it here would put the slow half back in front of the response and
  // undo the whole design.
  waitUntil(runGeneration(db, requestId, userId, prompt, filters, geminiKey));
}

/**
 * The slow half: Gemini, then persistence. Runs after the response has gone out,
 * so it can never reply to the caller — every outcome is written to
 * ai.generation_requests, which is what the client polls.
 *
 * It owns its own deadline. If the work cannot finish inside the budget it
 * fails *deliberately*, with time left to record why, rather than being killed
 * silently by the platform.
 */
async function runGeneration(
  db: Db,
  requestId: string,
  userId: string,
  prompt: string,
  filters: Filters,
  geminiKey: string,
) {
  const startedAt = Date.now();
  const deadline = startedAt + BUDGET_MS;

  try {
    step('calling gemini', { model: MODEL, budgetMs: BUDGET_MS });
    const { parsed, raw, tokensIn, tokensOut } = await callGemini(
      geminiKey,
      buildPrompt(prompt, filters),
      deadline,
    );
    step('gemini parsed', { tokensIn, tokensOut, elapsedMs: Date.now() - startedAt });

    const payload = parsed as { recipe?: Record<string, unknown> };
    if (!payload?.recipe?.title) {
      throw new GenerationFailure('failed', 'The model returned a recipe with no title.', raw);
    }

    payload.recipe.slug = slugify(String(payload.recipe.title));
    payload.recipe.language = payload.recipe.language ?? 'es';

    step('persisting', { slug: payload.recipe.slug });
    const { error: persistError } = await db.rpc('gen_succeed', {
      p_request_id: requestId,
      p_author_id: userId,
      p_payload: payload,
      p_raw: raw,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_latency_ms: Date.now() - startedAt,
    });

    if (persistError) {
      console.error('[generate] gen_succeed', persistError);
      await fail(db, requestId, 'failed', 'The recipe could not be saved.', raw, startedAt);
      return;
    }

    step('done', { elapsedMs: Date.now() - startedAt });
  } catch (e) {
    const failure = e instanceof GenerationFailure ? e : null;
    console.error('[generate] request', requestId, redact(failure?.message ?? String(e)));
    await fail(
      db,
      requestId,
      failure?.status === 'filtered' ? 'filtered' : 'failed',
      failure?.message ?? 'The generation failed.',
      failure?.raw ?? null,
      startedAt,
    );
  }
}

/** The response is already sent by the time this runs, so it can only log. */
async function fail(
  db: Db,
  requestId: string,
  status: 'failed' | 'filtered',
  message: string,
  raw: unknown,
  startedAt: number,
) {
  const { error } = await db.rpc('gen_fail', {
    p_request_id: requestId,
    p_status: status,
    p_error: message,
    p_raw: raw ?? null,
    p_latency_ms: Date.now() - startedAt,
  });
  if (error) console.error('[generate] gen_fail', error);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
