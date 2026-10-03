import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCredit } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Landing page for the confirmation link in the Resend signup email.
 * Verifies the token (which also opens the session cookie), then continues
 * to the payment page the signup stored (server-side redirect wins; the
 * localStorage post-auth redirect is the fallback).
 */
export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useCredit();
  const token = searchParams.get('token') || '';
  const [state, setState] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This link is missing its confirmation token.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users?action=auth_confirm&token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Confirmation failed (${res.status})`);
        if (cancelled) return;
        // Cookie is set — sync the client auth state before navigating.
        await refresh().catch(() => {});
        const target = data.redirect || (await import('../lib/postAuth')).takePostAuthRedirect();
        let path = '/dashboard?welcome=1';
        try {
          if (target) path = target.startsWith('http') ? new URL(target, window.location.origin).pathname + new URL(target, window.location.origin).search : target;
        } catch { /* fall through to default */ }
        setState('working');
        navigate(path, { replace: true });
      } catch (err: any) {
        if (cancelled) return;
        setState('error');
        setMessage(err.message || 'Confirmation failed');
      }
    })();
    return () => { cancelled = true; };
  }, [token, refresh, navigate]);

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="card-dark p-8 text-center max-w-lg mx-auto animate-fade-in">
        {state === 'working' ? (
          <>
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Confirming your email…</h2>
            <p className="text-ink-400">One moment — this opens your account.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">That link didn't work</h2>
            <p className="text-ink-400 mb-6">{message}</p>
            <div className="space-y-3">
              <Link to="/login" className="btn btn-primary w-full">Back to sign in</Link>
              <Link to="/register" className="btn btn-secondary w-full">Request a new confirmation email</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Ask for a password-reset email. Always shows the same neutral answer. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/users?action=auth_forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not send the reset email');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Could not send the reset email');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="card-dark p-8 max-w-md mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-7 h-7 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Forgot your password?</h2>
          <p className="text-ink-400 mt-1">We'll email you a secure reset link.</p>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">{error}</div>}
        {sent ? (
          <div className="text-center space-y-4">
            <div className="p-4 rounded-xl bg-green-950/40 border border-green-500/25 text-green-300 text-sm">
              <CheckCircle2 className="w-5 h-5 inline mr-1" />
              If <span className="font-semibold">{email}</span> has an account, a reset link is on its way.
              The link expires in 1 hour.
            </div>
            <Link to="/login" className="btn btn-secondary w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link to="/login" className="btn w-full">Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}

/** Choose a new password from the reset link in the email. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/users?action=auth_reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      navigate('/login', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Reset failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="card-dark p-8 max-w-md mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-7 h-7 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Choose a new password</h2>
        </div>
        {!token && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">
            This reset link is missing its token. <Link to="/forgot-password" className="text-purple-400">Request a new one</Link>.
          </div>
        )}
        {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat it" required minLength={8} />
          </div>
          <button type="submit" disabled={loading || !token} className="btn btn-primary w-full">
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>
        <p className="text-xs text-ink-500 text-center mt-4">
          For your security, signing out everywhere happens automatically after a password change.
        </p>
      </div>
    </div>
  );
}
