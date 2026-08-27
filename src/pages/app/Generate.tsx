import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { FilterSidebar } from '@/components/layout/FilterSidebar';
import { TwoPaneLayout } from '@/components/layout/TwoPaneLayout';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import {
  GenerationError,
  useGenerationStatus,
  useStartGeneration,
} from '@/queries/useGeneration';
import { EMPTY_FILTERS, countActive, type RecipeFilters } from '@/utils/filterArgs';
import { formatElapsed } from '@/utils/format';

/** What is actually happening, in order, so the wait has content. */
const PHASES = [
  { at: 0, text: 'Sending your filters to the model…' },
  { at: 4_000, text: 'The model is writing the recipe…' },
  { at: 14_000, text: 'Matching ingredients against the catalog…' },
  { at: 22_000, text: 'Working out nutrition and cost…' },
];

function phaseFor(ms: number): string {
  let text = PHASES[0]!.text;
  for (const p of PHASES) if (ms >= p.at) text = p.text;
  return text;
}

export default function Generate() {
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [prompt, setPrompt] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);

  const start = useStartGeneration();
  const { row, done, elapsedMs, error: statusError } = useGenerationStatus(requestId);
  const navigate = useNavigate();
  const { toast } = useToast();

  const quotaError = start.error instanceof GenerationError && start.error.overQuota
    ? start.error
    : null;
  const running = requestId != null && !done;

  function submit() {
    start.mutate(
      { prompt: prompt.trim(), filters },
      {
        onSuccess: ({ request_id }) => setRequestId(request_id),
        onError: () => toast('We couldn’t start the generation.', 'error'),
      },
    );
  }

  return (
    <TwoPaneLayout
      filters={
        // The same sidebar as the feed. On failure the filters stay put, so
        // retrying is one click.
        <FilterSidebar
          draft={filters}
          onDraftChange={setFilters}
          onApply={submit}
          onReset={() => setFilters(EMPTY_FILTERS)}
          dirty={!running}
          searching={start.isPending || running}
        />
      }
      footer={
        // v1's footer area: what you type and the button that fires it, pinned
        // under the results so it never scrolls away.
        <div className="flex flex-col gap-3">
          <TextArea
            label="Anything else?"
            placeholder="For dinner, something that holds up reheated…"
            hint={`${countActive(filters)} ${countActive(filters) === 1 ? 'filter activo' : 'filters activos'}`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="lg"
              loading={start.isPending}
              disabled={running}
              onClick={submit}
            >
              <Sparkles size={16} aria-hidden />
              Generar
            </Button>
          </div>
        </div>
      }
    >
      <section className="flex flex-col gap-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Generate a recipe</h1>
          <p className="mt-1 max-w-xl text-sm text-body">
            Pick what you have and what you don’t want. Whatever comes out is yours, as a draft,
            until you decide to publish it.
          </p>
        </header>

        {quotaError && (
          <p className="rounded-card border border-brand bg-surface px-4 py-3 text-sm text-body">
            {quotaError.message}
            {quotaError.quotaRemaining != null && (
              <span className="ml-1 font-mono text-muted">
                (te quedan {quotaError.quotaRemaining})
              </span>
            )}
          </p>
        )}

        {start.isError && !quotaError && (
          <p className="rounded-card border border-brand bg-surface px-4 py-3 text-sm text-body">
            {start.error.message}
          </p>
        )}

        {running && (
          <div className="flex flex-col gap-3 rounded-card border border-line-strong bg-surface px-5 py-6">
            <div className="flex items-center gap-3">
              <Spinner />
              {/* No fake progress bar. Real elapsed seconds and what is
                  happening — the job takes 20–30s and the user has a clock. */}
              <p className="text-sm text-body">{phaseFor(elapsedMs)}</p>
              <span className="ml-auto font-mono text-sm text-muted">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
            <p className="text-xs text-muted">
              It usually takes 20 to 30 seconds. You can leave this tab open.
            </p>
            {statusError && <p className="text-xs text-brand">{statusError}</p>}
          </div>
        )}

        {done && row?.status === 'success' && (
          <div className="flex flex-col gap-3 rounded-card border border-success bg-surface px-5 py-6">
            <h2 className="text-xl font-semibold text-ink">Ready, as a draft</h2>
            <p className="text-sm text-body">
              The model proposes, you publish. Look it over and decide whether to make it public.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (row.recipe_slug) navigate(`/r/${row.recipe_slug}`);
                  else navigate('/me');
                }}
              >
                View the recipe
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRequestId(null);
                  start.reset();
                }}
              >
                Generate another
              </Button>
            </div>
          </div>
        )}

        {done && row && row.status !== 'success' && (
          <div className="flex flex-col gap-3 rounded-card border border-brand bg-surface px-5 py-6">
            <h2 className="text-lg font-semibold text-brand">
              {row.status === 'filtered' ? 'The model declined to answer' : 'It didn’t work out'}
            </h2>
            <p className="text-sm text-body">
              {row.status === 'filtered'
                ? 'Try a different combination of filters.'
                : 'Something failed on the other end. Your filters are still set.'}
            </p>
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  setRequestId(null);
                  start.reset();
                  submit();
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          Rather write it yourself?{' '}
          <Link to="/me" className="text-brand no-underline hover:underline">
            Create a recipe by hand
          </Link>
          .
        </p>
      </section>
    </TwoPaneLayout>
  );
}
