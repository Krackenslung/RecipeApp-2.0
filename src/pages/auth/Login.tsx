import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (authError) {
      // Never surface the raw GoTrue message — log it, show something plain.
      console.error('[auth] signIn', authError);
      setError('Correo o contraseña incorrectos.');
      return;
    }
    navigate(location.state?.from ?? '/', { replace: true });
  }

  async function withGoogle() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      console.error('[auth] google', oauthError);
      setError('No pudimos abrir Google. Inténtalo de nuevo.');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-8">
      <h1 className="font-display text-3xl font-black tracking-tight text-comal">Entrar</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Correo"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" variant="primary" loading={busy}>
          Entrar
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-ceniza">
        <span className="h-px flex-1 bg-ceniza/25" />o<span className="h-px flex-1 bg-ceniza/25" />
      </div>

      <Button onClick={withGoogle}>Continuar con Google</Button>

      <p className="text-sm text-ceniza">
        ¿No tienes cuenta?{' '}
        <Link to="/signup" className="text-guajillo underline">
          Crea una
        </Link>
        .
      </p>
    </div>
  );
}
