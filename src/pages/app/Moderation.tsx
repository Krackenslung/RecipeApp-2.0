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
  open: 'Open',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
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
        <h1 className="text-3xl font-semibold text-ink">Moderation</h1>
        <p className="mt-1 text-sm text-body">
          {reports ? `${reports.length} unresolved` : '…'}
        </p>
      </header>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !reports?.length ? (
        <EmptyState title="Queue empty" message="Nothing reported for now." />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.report_id}
              className="flex flex-wrap items-start gap-4 rounded-card border border-line-strong bg-surface p-4"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-chip bg-hairline px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {r.target_type}
                  </span>
                  <span className="text-base font-semibold text-ink">
                    {r.reason}
                  </span>
                  <span className="font-mono text-xs text-body">{formatDate(r.created_at)}</span>
                  <span className="text-xs text-body">{STATUS_LABEL[r.status]}</span>
                </div>

                {r.details && <p className="mt-1.5 text-sm text-ink">{r.details}</p>}

                {/* target_id is text and polymorphic — recipes are uuid,
                    comments are integer. Only a recipe has a screen to link to. */}
                {r.target_type === 'recipe' && (
                  <Link
                    to={`/r/${r.target_id}`}
                    className="mt-1.5 inline-block font-mono text-xs text-brand underline"
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
                      { onSuccess: () => toast('Dismissed', 'success') },
                    )
                  }
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    resolve.mutate(
                      { reportId: r.report_id, status: 'resolved' },
                      { onSuccess: () => toast('Resolved', 'success') },
                    )
                  }
                >
                  Resolve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
