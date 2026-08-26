import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useHasRole } from '@/queries/useProfile';
import { Spinner } from '@/components/ui/states';

function Waiting() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/**
 * Route protection is a layout, not a per-page check. A page that checks auth
 * in its own body renders its content for a frame before redirecting.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Waiting />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** The other half: /login and /signup are for signed-out visitors only. */
export function RequireAnon() {
  const { user, loading } = useAuth();

  if (loading) return <Waiting />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Same idea one level up — app.has_role() is the check the policies use. */
export function RequireRole({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const { data: allowed, isLoading } = useHasRole(code);

  if (loading || isLoading) return <Waiting />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/" replace />;
  return <Outlet />;
}
