import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { FilterSidebar } from '@/components/layout/FilterSidebar';
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
  { at: 0, text: 'Mandando tus filtros al modelo…' },
  { at: 4_000, text: 'El modelo está escribiendo la receta…' },
  { at: 14_000, text: 'Cuadrando ingredientes con el catálogo…' },
  { at: 22_000, text: 'Calculando nutrición y costo…' },
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
        onError: () => toast('No pudimos empezar la generación.', 'error'),
      },
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
      <aside>
        {/* The same sidebar as the feed. On failure the filters stay put, so
            retrying is one click. */}
        <FilterSidebar
          draft={filters}
          onDraftChange={setFilters}
          onApply={submit}
          onReset={() => setFilters(EMPTY_FILTERS)}
          dirty={!running}
          searching={start.isPending || running}
        />
      </aside>

      <section className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-3xl font-black tracking-tight text-comal">
            Generar una receta
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ceniza">
            Elige lo que tienes y lo que no quieres. Lo que salga es tuyo, en borrador, hasta que
            decidas publicarlo.
          </p>
        </header>

        <TextArea
          label="¿Algo más?"
          placeholder="Para la cena, algo que aguante el recalentado…"
          hint={`${countActive(filters)} ${countActive(filters) === 1 ? 'filtro activo' : 'filtros activos'}`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
        />

        {!running && !done && (
          <div>
            <Button variant="primary" size="lg" loading={start.isPending} onClick={submit}>
              <Sparkles size={16} aria-hidden />
              Generar
            </Button>
          </div>
        )}

        {quotaError && (
          <p className="border border-guajillo/40 px-4 py-3 text-sm text-comal">
            {quotaError.message}
            {quotaError.quotaRemaining != null && (
              <span className="ml-1 font-mono text-ceniza">
                (te quedan {quotaError.quotaRemaining})
              </span>
            )}
          </p>
        )}

        {start.isError && !quotaError && (
          <p className="border border-guajillo/40 px-4 py-3 text-sm text-comal">
            {start.error.message}
          </p>
        )}

        {running && (
          <div className="flex flex-col gap-3 border border-ceniza/25 bg-cal px-5 py-6">
            <div className="flex items-center gap-3">
              <Spinner />
              {/* No fake progress bar. Real elapsed seconds and what is
                  happening — the job takes 20–30s and the user has a clock. */}
              <p className="text-sm text-comal">{phaseFor(elapsedMs)}</p>
              <span className="ml-auto font-mono text-sm text-ceniza">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
            <p className="text-xs text-ceniza">
              Normalmente tarda entre 20 y 30 segundos. Puedes dejar esta pestaña abierta.
            </p>
            {statusError && <p className="text-xs text-guajillo">{statusError}</p>}
          </div>
        )}

        {done && row?.status === 'success' && (
          <div className="flex flex-col gap-3 border border-tomatillo/45 bg-cal px-5 py-6">
            <h2 className="font-display text-xl font-black tracking-tight text-comal">
              Lista, en borrador
            </h2>
            <p className="text-sm text-ceniza">
              El modelo propone, tú publicas. Revísala y decide si la haces pública.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  if (row.recipe_slug) navigate(`/r/${row.recipe_slug}`);
                  else navigate('/me');
                }}
              >
                Ver la receta
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRequestId(null);
                  start.reset();
                }}
              >
                Generar otra
              </Button>
            </div>
          </div>
        )}

        {done && row && row.status !== 'success' && (
          <div className="flex flex-col gap-3 border border-guajillo/40 bg-cal px-5 py-6">
            <h2 className="font-display text-lg font-black tracking-tight text-guajillo">
              {row.status === 'filtered' ? 'El modelo no quiso responder' : 'No salió'}
            </h2>
            <p className="text-sm text-ceniza">
              {row.status === 'filtered'
                ? 'Prueba con otra combinación de filtros.'
                : 'Algo falló del otro lado. Tus filtros siguen puestos.'}
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
                Reintentar
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-ceniza">
          ¿Prefieres escribirla tú?{' '}
          <Link to="/me" className="text-guajillo underline">
            Crea una receta a mano
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
