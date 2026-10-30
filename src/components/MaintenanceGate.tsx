import { useCallback, useEffect, useState } from 'react';
import { Wrench, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
}

/** Module-level cache: the gate mounts once, but the admin Update Mode tab
 * and any remount share the last poll so the first paint is never a lie. */
let latest: { state: MaintenanceState; at: number } | null = null;

/**
 * Boot-level Update Mode gate.
 *
 * Reads the admin-controlled state from /api/users?action=maintenance
 * (public GET — the same source the server-side 503 gates use), and while
 * the mode is ON non-admins see a full-screen "site is updating" page
 * instead of the whole app. Admins are never gated (the server exempts
 * them too) but see a red banner so they remember the site is closed.
 * Rechecks every 60s and on window focus, so the flip propagates without
 * a page reload in both directions.
 */
export function useMaintenance() {
  const [state, setState] = useState<MaintenanceState | null>(() => latest?.state ?? null);
  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/users?action=maintenance');
      const data = await res.json();
      const next: MaintenanceState = {
        enabled: !!data.enabled,
        message: data.message || 'The Studio is being upgraded. Please refresh again shortly.',
        updatedAt: data.updatedAt ?? null,
      };
      latest = { state: next, at: Date.now() };
      setState(next);
    } catch {
      // Unreachable API → fail-open (matches lib/maintenance.ts). The site
      // must never be locked by an outage that merely hides the state row.
    }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(id); window.removeEventListener('focus', check); };
  }, [check]);

  return { state, refresh: check };
}

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  // Single source of truth: the same isAdmin the dashboard routes already
  // trust (role check + the two admin emails in AuthContext).
  const { isAdmin, loading } = useAuth();
  const { state } = useMaintenance();

  // While the session is still loading the user identity is unknown —
  // hold the page render for that beat (the auth context shows its own
  // splash); otherwise a signed-in admin would see the gate flash first.
  if (loading) return null;
  if (state?.enabled && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0817] text-white p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center">
            <Wrench className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold">We're upgrading PropReel</h1>
          <p className="text-ink-300">{state.message}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary min-h-[44px] px-6 inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <p className="text-[11px] text-ink-500">Update mode enabled {state.updatedAt ? new Date(state.updatedAt).toLocaleString('en-ZA') : 'just now'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {state?.enabled && isAdmin && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-sm text-center py-2 flex items-center justify-center gap-2 shadow-lg">
          <ShieldAlert className="w-4 h-4" />
          Update mode is ON — the site is closed to everyone except you.
          {state.updatedAt && <span className="opacity-70">({new Date(state.updatedAt).toLocaleTimeString('en-ZA')})</span>}
        </div>
      )}
      {children}
    </>
  );
}
