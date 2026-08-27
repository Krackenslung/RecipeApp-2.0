import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recipeDb, supabase, unwrap } from '@/lib/supabase';
import type { RecipeFilters } from '@/utils/filterArgs';

export type GenerationStatus = 'pending' | 'success' | 'failed' | 'filtered';

export type GenerationRow = {
  request_id: string;
  status: GenerationStatus;
  recipe_id: string | null;
  recipe_slug: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type StartGenerationInput = { prompt: string; filters: RecipeFilters };

export type StartGenerationResult = { request_id: string };

/** Everything the screen needs to say what went wrong without leaking a raw error. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly quotaRemaining?: number,
    readonly overQuota = false,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * Step 1 of the async design: POST returns a request_id in under a second.
 * The Gemini key lives in api/generate.ts, so this is the one fetch in the app
 * that does not go through supabase-js.
 */
export function useStartGeneration() {
  return useMutation<StartGenerationResult, GenerationError, StartGenerationInput>({
    mutationFn: async ({ prompt, filters }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new GenerationError('Sign in to generate recipes.');

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt, filters }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        data?: StartGenerationResult;
        error?: string;
        quota_remaining?: number;
      };

      if (res.status === 429) {
        // Quota lives in ai.usage_quota and the client cannot read it — the
        // remaining count only arrives in this response body.
        throw new GenerationError(
          body.error ?? 'You’ve hit your generation limit for today.',
          body.quota_remaining ?? 0,
          true,
        );
      }
      if (!res.ok || body.error || !body.data) {
        throw new GenerationError(body.error ?? 'We couldn’t generate the recipe. Try again.');
      }
      return body.data;
    },
  });
}

const POLL_MS = 3_000;
/** Realtime gets this long to prove it works before polling takes over. */
const SOCKET_GRACE_MS = 4_000;

/**
 * Watches one generation request. Realtime first; polling every 3s if the socket
 * never connects.
 *
 * Caveat worth knowing: `ai` is not in the exposed-schemas list and its tables
 * carry RLS with zero policies, so realtime will usually deliver nothing and
 * the poll is what actually reports the result. The subscription stays because
 * it costs nothing and starts working the day a replication policy is added.
 */
export function useGenerationStatus(requestId: string | null) {
  const qc = useQueryClient();
  const [row, setRow] = useState<GenerationRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number>(0);

  const done = row?.status === 'success' || row?.status === 'failed' || row?.status === 'filtered';
  const doneRef = useRef(false);
  doneRef.current = done;

  const fetchStatus = useCallback(async (id: string) => {
    try {
      const rows = unwrap(await recipeDb.rpc('get_generation_status', { p_request_id: id }));
      const first = Array.isArray(rows) ? rows[0] : rows;
      if (first) setRow(first as GenerationRow);
    } catch (e) {
      console.error('[generation] status', e);
      setError('We couldn’t read the generation status.');
    }
  }, []);

  // Elapsed time. Real seconds, because a fake progress bar for a 20–30s job
  // is a lie the user can time with their phone.
  useEffect(() => {
    if (!requestId || done) return;
    startedAt.current = startedAt.current || Date.now();
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [requestId, done]);

  useEffect(() => {
    if (!requestId) {
      setRow(null);
      setError(null);
      setElapsedMs(0);
      startedAt.current = 0;
      return;
    }

    let cancelled = false;
    let socketLive = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    void fetchStatus(requestId);

    const channel = supabase
      .channel(`generation:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'ai',
          table: 'generation_requests',
          filter: `request_id=eq.${requestId}`,
        },
        () => {
          socketLive = true;
          void fetchStatus(requestId);
        },
      )
      .subscribe();

    const grace = setTimeout(() => {
      if (cancelled || socketLive || doneRef.current) return;
      poll = setInterval(() => {
        // The row is terminal: nothing left to ask about.
        if (doneRef.current) {
          if (poll) clearInterval(poll);
          return;
        }
        void fetchStatus(requestId);
      }, POLL_MS);
    }, SOCKET_GRACE_MS);

    return () => {
      cancelled = true;
      clearTimeout(grace);
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [requestId, fetchStatus]);

  // Stop polling and let the new draft show up in the user's own lists.
  useEffect(() => {
    if (done) qc.invalidateQueries({ queryKey: ['recipes'] });
  }, [done, qc]);

  return { row, status: row?.status ?? null, done, error, elapsedMs };
}
