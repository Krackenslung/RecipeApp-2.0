import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { socialDb, unwrap } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/utils/format';
import type { Database } from '@/types/database';

type Report = Database['social']['Tables']['reports']['Row'];
type Status = Report['status'];

const STATUS_LABEL: Record<Status, string> = {
  open: 'Abierto',
  reviewing: 'En revisión',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
};

function useReports() {
  return useQuery({
    queryKey: ['reports', 'queue'],
    queryFn: async (): Promise<Report[]> =>
      unwrap(
        await socialDb
          .from('reports')
          .select('*')
          .in('status', ['open', 'reviewing'])
          .order('created_at', { ascending: true })
          .range(0, 99),
      ),
  });
}

function useResolveReport() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ reportId, status }: { reportId: number; status: Status }) =>
      unwrap(
        await socialDb
          .from('reports')
          .update({
            status,
            resolved_by: user?.id ?? null,
            resolved_at: new Date().toISOString(),
          })
          .eq('report_id', reportId)
          .select('report_id')
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

/**
 * Last in the build order and lowest priority — operationally useful only once
 * there are users to moderate.
 */
export default function Moderation() {
  const { data: reports, isLoading, isError, refetch } = useReports();
  const resolve = useResolveReport();
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-black tracking-tight text-comal">Moderación</h1>
        <p className="mt-1 text-sm text-ceniza">
          {reports ? `${reports.length} sin resolver` : '…'}
        </p>
      </header>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !reports?.length ? (
        <EmptyState title="Cola vacía" message="Nada reportado por ahora." />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.report_id}
              className="flex flex-wrap items-start gap-4 border border-ceniza/20 bg-cal p-4"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="border border-ceniza/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ceniza">
                    {r.target_type}
                  </span>
                  <span className="font-display text-base font-black tracking-tight text-comal">
                    {r.reason}
                  </span>
                  <span className="font-mono text-xs text-ceniza">{formatDate(r.created_at)}</span>
                  <span className="text-xs text-ceniza">{STATUS_LABEL[r.status]}</span>
                </div>

                {r.details && <p className="mt-1.5 text-sm text-comal">{r.details}</p>}

                {/* target_id is text and polymorphic — recipes are uuid,
                    comments are integer. Only a recipe has a screen to link to. */}
                {r.target_type === 'recipe' && (
                  <Link
                    to={`/r/${r.target_id}`}
                    className="mt-1.5 inline-block font-mono text-xs text-guajillo underline"
                  >
                    {r.target_id}
                  </Link>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    resolve.mutate(
                      { reportId: r.report_id, status: 'dismissed' },
                      { onSuccess: () => toast('Descartado', 'success') },
                    )
                  }
                >
                  Descartar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    resolve.mutate(
                      { reportId: r.report_id, status: 'resolved' },
                      { onSuccess: () => toast('Resuelto', 'success') },
                    )
                  }
                >
                  Resolver
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
