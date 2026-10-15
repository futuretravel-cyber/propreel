import { useEffect, useState } from 'react';
import { Wrench, Power, Loader2, ShieldCheck, Info } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface State {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
}

/**
 * Admin → Update Mode: one switch that puts the ENTIRE site into a
 * maintenance window:
 *   • every non-admin browser session shows the full-screen "upgrading"
 *     page (MaintenanceGate) instead of the app, and
 *   • every API surface answers 503 to non-admin callers (the gate lives
 *     in users.ts and credits.ts; auth/session stays reachable so admins
 *     can sign in during the window).
 * Admins keep full access — the tab is how they take the site down and
 * bring it back, from here.
 */
export default function AdminUpdateMode() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');

  const load = () =>
    fetch('/api/users?action=maintenance')
      .then(r => r.json())
      .then((d: State & { success?: boolean; error?: string }) => {
        if (typeof d.enabled === 'boolean') { setState(d); setDraftMessage(d.message || ''); }
        else toast.error(d?.error || 'Failed to load state');
      })
      .catch(() => toast.error('Could not reach the maintenance status'));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setMode = async (enabled: boolean) => {
    const verb = enabled ? 'enable' : 'disable';
    if (enabled && !confirm(
      'Enable Update Mode?\n\nThe whole site locks for everyone except you (full-screen update page + API 503s for non-admins) until you switch it off.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users?action=maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, message: draftMessage }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setState({ enabled, message: data.message, updatedAt: data.updatedAt });
      toast.success(enabled ? 'Update mode enabled — the site is now closed to others' : 'Update mode disabled — the site is live', 'Update Mode');
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${verb} update mode`);
    } finally {
      setSaving(false);
    }
  };

  if (!state) return <p className="text-sm text-ink-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading update-mode state…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Wrench className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Update Mode</h2>
      </div>

      <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-medium">{state.enabled ? 'The site is currently IN update mode' : 'The site is currently live'}</p>
            <p className="text-xs text-ink-400 mt-1">
              {state.enabled
                ? `Locked since ${state.updatedAt ? new Date(state.updatedAt).toLocaleString('en-ZA') : '—'} — only admin sessions can get in.`
                : 'Visitors and agents see the normal app.'}
            </p>
          </div>
          <button
            onClick={() => setMode(!state.enabled)}
            disabled={saving}
            className={`btn min-h-[44px] px-5 ${state.enabled ? 'btn-ghost text-green-400' : 'bg-red-600 hover:bg-red-500 text-white'}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            {state.enabled ? 'Take the site live' : 'Put site in update mode'}
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-300 mb-1">Message shown to visitors during the window</label>
          <textarea
            value={draftMessage}
            onChange={e => setDraftMessage(e.target.value)}
            maxLength={300}
            className="input w-full h-20"
            placeholder="The Studio is being upgraded with new features. This takes a few minutes — please refresh again shortly."
          />
          <p className="text-[11px] text-ink-500 mt-1">Saved to the mode state when you toggle — not live-editable while the window is open (toggle off/on to refresh it).</p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2 text-xs text-ink-400">
        <p className="flex items-center gap-2 font-medium text-ink-300"><Info className="w-4 h-4 text-purple-400" /> What update mode does</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Non-admin sessions get the full-screen "We're upgrading PropReel" page — the whole dashboard, studio and public pages are replaced.</li>
          <li>The API answers 503 to every non-admin caller (credits, renders, jobs — the lot). Sign-in and the status check stay reachable.</li>
          <li>You keep full access, with a red banner at the top of the app as long as the mode is on.</li>
          <li>Background systems (crons, Paystack webhooks, render workers) keep running — in-flight renders finish and their refunds still work.</li>
          <li>Fail-open: if the settings table is unreachable the site stays live — a database outage can never permanently lock you out.</li>
        </ul>
        <p className="flex items-center gap-2 font-medium text-ink-300 pt-1"><ShieldCheck className="w-4 h-4 text-green-400" /> Server-side enforced</p>
        <p>The gate is enforced on the API too — a modified client cannot bypass it by calling the endpoints directly.</p>
      </div>
    </div>
  );
}
