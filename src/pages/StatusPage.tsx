import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, RefreshCw, Clock,
  Activity, Database, Cloud, Cpu, Mic, Zap, ShieldCheck,
} from 'lucide-react';
import { formatRelative } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

// STEALTH RULE (2026-10-27): this page must never name infrastructure or AI
// vendors — public copy is provider-neutral by design so nothing on the site
// reveals which platforms or models run underneath. Raw probe detail and
// scheduled-job internals render only for signed-in admins.
import { RENDER_ENDPOINT as WORKER_URL } from '../lib/renderEndpoint';

type State = 'up' | 'down' | 'degraded' | 'unknown';

interface CronInfo {
  name: string;
  label: string;
  schedule: string;
  lastRun: { status: 'success' | 'error'; finishedAt: string; durationMs: number; detail: string | null } | null;
  healthy: boolean | null;
  ageHours: number | null;
}

interface StatusData {
  api: { state: State; detail: string; latencyMs: number | null };
  database: { state: State; detail: string };
  storage: { state: State; detail: string };
  worker: { state: State; detail: string; latencyMs: number | null };
  ai: { state: State; detail: string; latencyMs: number | null; checkedAt: string | null };
  auth: { state: State; detail: string; latencyMs: number | null };
  crons: CronInfo[];
  generatedAt: string;
}

const INITIAL: StatusData = {
  api: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  database: { state: 'unknown', detail: 'Checking…' },
  storage: { state: 'unknown', detail: 'Checking…' },
  worker: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  ai: { state: 'unknown', detail: 'Checking…', latencyMs: null, checkedAt: null },
  auth: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  crons: [],
  generatedAt: '',
};

/** fetch with a hard timeout so a hung endpoint shows as down, not forever-loading */
async function probe(url: string, init: RequestInit = {}, timeoutMs = 25000): Promise<{ ok: boolean; status: number; body: any; latencyMs: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, body, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Probe with one retry — cold starts can stall the first attempt. */
async function probeWithRetry(url: string, init: RequestInit = {}, attempts = 2): Promise<{ ok: boolean; status: number; body: any; latencyMs: number }> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await probe(url, init);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2000);
    }
  }
  throw last;
}

export default function StatusPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState<StatusData>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next: StatusData = { ...INITIAL };

    // 1) Platform API — also proves the data layer is serving reads
    try {
      const r = await probe('/api/leads?action=status');
      if (r.ok && r.body?.success) {
        next.api = { state: 'up', detail: 'All endpoints responding', latencyMs: r.latencyMs };
        next.database = { state: 'up', detail: 'Reading account data' };
        next.storage = {
          state: r.body.storage?.healthy === true ? 'up' : r.body.storage?.healthy === false ? 'down' : 'unknown',
          detail: String(r.body.storage?.detail || 'Not checked'),
        };
        next.crons = Array.isArray(r.body.crons) ? r.body.crons : [];
      } else {
        next.api = { state: 'down', detail: `Error response (${r.status})`, latencyMs: r.latencyMs };
        next.database = { state: 'unknown', detail: 'Unverified — API unreachable' };
        next.storage = { state: 'unknown', detail: 'Unverified — API unreachable' };
      }
    } catch {
      next.api = { state: 'down', detail: 'Not responding', latencyMs: null };
      next.database = { state: 'unknown', detail: 'Unverified — API unreachable' };
      next.storage = { state: 'unknown', detail: 'Unverified — API unreachable' };
    }

    // 2) Rendering pipeline
    try {
      const r = await probeWithRetry(`${WORKER_URL}/health`);
      next.worker = r.ok && r.body?.status === 'healthy'
        ? { state: 'up', detail: `Pipeline online${r.body?.version ? ` · v${r.body.version}` : ''}`, latencyMs: r.latencyMs }
        : { state: 'down', detail: `Unexpected response (${r.status})`, latencyMs: r.latencyMs };
    } catch {
      next.worker = { state: 'down', detail: 'No response from the render pipeline', latencyMs: null };
    }

    // 3) AI generation — from the scheduled probe (class-classified, 15 min cadence)
    try {
      const r = await probeWithRetry(`${WORKER_URL}/probe`);
      const b = r.body || {};
      const cls = String(b.class || '');
      if (b.healthy === true) {
        next.ai = { state: 'up', detail: 'AI models responding normally', latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      } else if (cls === 'billing_locked' || cls === 'auth_failed') {
        next.ai = { state: 'down', detail: String(b.detail || 'Service unavailable'), latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      } else if (cls === 'no_data' || (!b.healthy && !cls)) {
        next.ai = { state: 'unknown', detail: String(b.detail || 'Probe result unavailable'), latencyMs: null, checkedAt: null };
      } else {
        next.ai = { state: 'degraded', detail: String(b.detail || 'Service degraded'), latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      }
    } catch {
      next.ai = { state: 'unknown', detail: 'Probe unreachable', latencyMs: null, checkedAt: null };
    }

    // 4) First-party authentication
    try {
      const r = await probeWithRetry('/api/users?action=auth_session', { credentials: 'include' });
      next.auth = r.ok
        ? { state: 'up', detail: 'Sign-in service responding', latencyMs: r.latencyMs }
        : { state: 'unknown', detail: `Session endpoint returned ${r.status}`, latencyMs: r.latencyMs };
    } catch {
      next.auth = { state: 'down', detail: 'No response from the sign-in service', latencyMs: null };
    }

    next.generatedAt = new Date().toISOString();
    if (mounted.current) {
      setData(next);
      setLastUpdated(new Date());
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const iv = window.setInterval(refresh, 60000); // auto-refresh every minute
    return () => { mounted.current = false; window.clearInterval(iv); };
  }, [refresh]);

  const services = [
    { key: 'api', icon: Activity, name: 'Website & API', description: 'Dashboard, uploads and project management', ...data.api },
    { key: 'auth', icon: ShieldCheck, name: 'Accounts & sign-in', description: 'Sign-in, sessions and account security', ...data.auth },
    { key: 'worker', icon: Cpu, name: 'Rendering pipeline', description: 'Video and image processing', ...data.worker },
    { key: 'ai', icon: Mic, name: 'AI generation', description: 'Voiceover, video, image and text generation', ...data.ai },
    { key: 'storage', icon: Cloud, name: 'Media storage', description: 'Uploads and render outputs', state: data.storage.state, detail: data.storage.detail, latencyMs: null },
    { key: 'database', icon: Database, name: 'Data services', description: 'Accounts, projects and billing records', state: data.database.state, detail: data.database.detail, latencyMs: null },
  ];

  // Cron "no runs recorded yet" (null) is not a fault — it must not drag the
  // overall banner into unknown. An overdue cron (false) is a degradation.
  const states: State[] = [
    ...services.map(s => s.state),
    ...data.crons.filter(c => c.healthy === false).map(() => 'degraded' as State),
  ];
  const overall: State = states.includes('down') ? 'down' : states.includes('degraded') ? 'degraded' : states.includes('unknown') ? 'unknown' : 'up';
  const banner = {
    up: { icon: CheckCircle2, cls: 'bg-green-950/40 border-green-500/30 text-green-300', title: 'All systems operational', sub: 'Every service is responding normally.' },
    degraded: { icon: AlertTriangle, cls: 'bg-yellow-950/40 border-yellow-500/30 text-yellow-300', title: 'Partial degradation', sub: 'Some services are slow or partially unavailable.' },
    unknown: { icon: HelpCircle, cls: 'bg-ink-800/60 border-white/10 text-ink-300', title: 'Status partly unknown', sub: 'Some checks could not be completed right now.' },
    down: { icon: XCircle, cls: 'bg-red-950/40 border-red-500/30 text-red-300', title: 'Service disruption', sub: 'One or more services are unavailable. Our team has been notified.' },
  }[overall];
  const BannerIcon = banner.icon;

  const stateIcon = (s: State) => {
    const cls = 'w-5 h-5 flex-shrink-0';
    switch (s) {
      case 'up': return <CheckCircle2 className={`${cls} text-green-400`} aria-label="Operational" />;
      case 'degraded': return <AlertTriangle className={`${cls} text-yellow-400`} aria-label="Degraded" />;
      case 'down': return <XCircle className={`${cls} text-red-400`} aria-label="Down" />;
      default: return <HelpCircle className={`${cls} text-ink-500`} aria-label="Unknown" />;
    }
  };
  const stateLabel: Record<State, string> = { up: 'Operational', down: 'Down', degraded: 'Degraded', unknown: 'Unknown' };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-purple-400" /> System status
          </h1>
          <p className="text-ink-400 mt-2">
            Live health of the services behind PropReel — refreshed automatically every minute.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-ink-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated {formatRelative(lastUpdated.toISOString())}
            </span>
          )}
          <button onClick={refresh} disabled={refreshing} className="btn btn-secondary text-sm" aria-label="Refresh status">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Overall banner */}
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${banner.cls}`} role="status">
        <BannerIcon className="w-7 h-7 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-lg">{banner.title}</p>
          <p className="text-sm opacity-80 mt-0.5">{banner.sub}</p>
        </div>
      </div>

      {/* Services — public rows are provider-neutral; raw detail is admin-only */}
      <div className="card-dark divide-y divide-white/5 overflow-hidden">
        {services.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-center gap-4 p-4">
              {stateIcon(s.state)}
              <Icon className="w-5 h-5 text-ink-400 flex-shrink-0 hidden sm:block" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{s.name}</p>
                <p className="text-xs text-ink-500 truncate">{s.description}</p>
                {isAdmin && s.detail && s.detail !== 'Checking…' && (
                  <p className="text-xs text-ink-400 mt-0.5 truncate" title={s.detail}>{s.detail}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-medium ${s.state === 'up' ? 'text-green-400' : s.state === 'down' ? 'text-red-400' : s.state === 'degraded' ? 'text-yellow-400' : 'text-ink-500'}`}>
                  {stateLabel[s.state]}
                </p>
                {s.latencyMs != null && <p className="text-xs text-ink-500 tabular-nums">{s.latencyMs} ms</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scheduled jobs — operational internals, admins only */}
      {isAdmin && (
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-purple-400" /> Scheduled jobs
          </h2>
          <div className="card-dark divide-y divide-white/5 overflow-hidden">
            {data.crons.length === 0 ? (
              <div className="p-4 text-sm text-ink-400">Job schedule unavailable — the status API did not respond.</div>
            ) : data.crons.map(c => (
              <div key={c.name} className="p-4 flex items-start gap-4">
                {stateIcon(c.healthy === null ? 'unknown' : c.healthy ? 'up' : 'down')}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{c.label}</p>
                  <p className="text-xs text-ink-500">{c.schedule}</p>
                  {c.lastRun ? (
                    <p className="text-xs text-ink-400 mt-1">
                      Last run {formatRelative(c.lastRun.finishedAt)}
                      {c.lastRun.durationMs != null && <> · took {(c.lastRun.durationMs / 1000).toFixed(1)}s</>}
                      {c.lastRun.status === 'error' && <span className="text-red-400"> · failed: {c.lastRun.detail || 'unknown error'}</span>}
                      {c.lastRun.status === 'success' && c.lastRun.detail && <span className="text-ink-500"> · {c.lastRun.detail}</span>}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-500 mt-1">No runs recorded yet — daily jobs record their first run at the next scheduled slot.</p>
                  )}
                  {c.healthy === false && c.lastRun?.status === 'success' && (
                    <p className="text-xs text-yellow-400 mt-1">Overdue — last run is older than the expected schedule.</p>
                  )}
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ${c.healthy === null ? 'text-ink-500' : c.healthy ? 'text-green-400' : 'text-red-400'}`}>
                  {c.healthy === null ? 'No data' : c.healthy ? 'On schedule' : 'Overdue'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-500">
        Some checks run automatically on a schedule; everything else is probed live when you open this page. Incidents and maintenance notices are posted here.
      </p>
    </div>
  );
}
