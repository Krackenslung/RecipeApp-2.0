import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // The app.profiles row is created by an after-insert trigger on auth.users.
    // The client cannot write to auth, so the username travels in user_metadata
    // and the trigger reads it from there.
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim().toLowerCase() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);

    if (authError) {
      console.error('[auth] signUp', authError);
      setError(
        authError.message.includes('already')
          ? 'There’s already an account with that email.'
          : 'We couldn’t create your account. Try again.',
      );
      return;
    }

    if (data.session) {
      navigate('/', { replace: true });
    } else {
      toast('We sent you an email to confirm your account.', 'info');
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-line-strong bg-surface px-8 py-10 shadow-card">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Create account</h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="Username"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            hint="Letters, numbers and underscores. It’s what shows on your profile."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Create account
          </Button>
        </form>

        <p className="text-sm text-body">
          Already have an account?{' '}
          <Link to="/login" className="text-brand no-underline hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
