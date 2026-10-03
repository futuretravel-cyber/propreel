import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * /2fa-setup — scan the QR with Google Authenticator / Authy, type the
 * 6-digit code, done. Reached from sign-up (checkbox at registration),
 * from sign-in when setup is pending, or from Settings.
 */
async function auth2fa(action: string, payload: Record<string, any> = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function TwoFactorSetupPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const enabled = !!user?.twoFactorEnabled;
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Not enabled yet → mint a secret straight away (page exists for exactly this)
  useEffect(() => {
    if (enabled) return;
    auth2fa('auth_2fa_setup')
      .then(d => setSetup({ secret: d.secret, otpauthUrl: d.otpauthUrl }))
      .catch(e => toast.error(e.message || 'Could not start setup', 'Two-step verification'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const submit = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await auth2fa('auth_2fa_disable', { code });
        toast.success('Two-step verification disabled', 'Security');
      } else {
        await auth2fa('auth_2fa_confirm', { code });
        toast.success('Two-step verification enabled', 'Security');
      }
      await refresh();
      navigate('/dashboard/settings');
    } catch (e: any) {
      toast.error(e.message || 'Invalid code');
      setBusy(false);
    }
  };

  const skip = async () => {
    try {
      await auth2fa('auth_2fa_skip');
    } catch {
      // best effort — the prompt reappears on next login if it fails
    }
    navigate('/dashboard');
  };

  const copySecret = () => {
    if (!setup) return;
    navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg card-dark p-8 space-y-6">
        <div className="text-center">
          <span className="w-12 h-12 rounded-2xl bg-purple-600/20 flex items-center justify-center mx-auto mb-3">
            {enabled ? <ShieldOff className="w-6 h-6 text-purple-400" /> : <ShieldCheck className="w-6 h-6 text-purple-400" />}
          </span>
          <h1 className="text-2xl font-bold text-white">{enabled ? 'Two-step verification is on' : 'Set up two-step verification'}</h1>
          <p className="text-ink-400 text-sm mt-1">
            {enabled
              ? 'Enter the current code from your authenticator app to turn it off.'
              : 'Scan the QR code with Google Authenticator, Authy or 1Password, then enter the 6-digit code.'}
          </p>
        </div>

        {!enabled && setup && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauthUrl)}`}
                alt="Scan with your authenticator app"
                className="bg-white rounded-xl p-2"
                width={200}
                height={200}
              />
              <button
                onClick={copySecret}
                className="flex items-center gap-2 text-xs font-mono text-ink-300 bg-ink-800 border border-white/10 rounded-lg px-3 py-2 hover:border-purple-500/50 transition"
                title="Copy the setup key"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {setup.secret}
              </button>
              <p className="text-[11px] text-ink-500">Can't scan? Enter this key manually in your authenticator app.</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="label">{enabled ? 'Current code' : '6-digit code'}</label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="input text-center text-xl tracking-[0.5em]"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </div>

        <div className="space-y-3">
          <button onClick={submit} disabled={busy || code.length !== 6 || (!enabled && !setup)} className="btn btn-primary w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {enabled ? 'Disable two-step verification' : 'Enable two-step verification'}
          </button>
          <button onClick={enabled ? () => navigate('/dashboard/settings') : skip} className="btn btn-ghost w-full text-sm">
            {enabled ? 'Back to Settings' : 'Set up later'}
          </button>
        </div>
      </div>
    </div>
  );
}
