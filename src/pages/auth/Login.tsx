import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import logo from '@/assets/recipes_powered_by_gemini_logo.png';

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
      setError('Wrong email or password.');
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
      setError('We couldn’t open Google. Try again.');
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-line-strong bg-surface px-8 py-10 shadow-card">
        {/* The card is the only chrome on these routes — no AppShell, so this is
            the one place the app names itself. */}
        <img src={logo} alt="Recipes powered by Gemini" className="mx-auto mb-8 h-16 w-auto" />
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Sign in</h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Sign in
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line-strong" />or
          <span className="h-px flex-1 bg-line-strong" />
        </div>

        <Button onClick={withGoogle}>Continue with Google</Button>

        <p className="text-sm text-body">
          No account yet?{' '}
          <Link to="/signup" className="text-brand no-underline hover:underline">
            Create one
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
