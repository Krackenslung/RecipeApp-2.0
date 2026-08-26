import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/states';

/**
 * Where Google lands. `detectSessionInUrl` on the client does the actual
 * exchange; this screen only waits for it to settle and then gets out of the way.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.session) {
        console.error('[auth] callback', error);
        setFailed(true);
        return;
      }
      navigate('/', { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (failed) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="font-display text-2xl font-black tracking-tight text-comal">
          No pudimos entrar
        </h1>
        <p className="mt-2 text-sm text-ceniza">La sesión no se completó.</p>
        <Link to="/login" className="mt-4 inline-block text-sm text-guajillo underline">
          Intentar de nuevo
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-ceniza">Entrando…</p>
    </div>
  );
}
