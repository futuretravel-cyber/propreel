import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, RefreshCw, Clock,
  Activity, Database, Cloud, Cpu, Mic, Zap, ShieldCheck,
} from 'lucide-react';
import { formatRelative } from '../lib/utils';

const WORKER_URL = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://agcchttiomlbuuycwdgy.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
  fal: { state: State; detail: string; latencyMs: number | null; checkedAt: string | null };
  auth: { state: State; detail: string; latencyMs: number | null };
  crons: CronInfo[];
  generatedAt: string;
}

const INITIAL: StatusData = {
  api: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  database: { state: 'unknown', detail: 'Checking…' },
  storage: { state: 'unknown', detail: 'Checking…' },
  worker: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  fal: { state: 'unknown', detail: 'Checking…', latencyMs: null, checkedAt: null },
  auth: { state: 'unknown', detail: 'Checking…', latencyMs: null },
  crons: [],
  generatedAt: '',
};

/** fetch with a hard timeout so a hung endpoint shows as down, not forever-loading */
async function probe(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<{ ok: boolean; status: number; body: any; latencyMs: number }> {
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

export default function StatusPage() {
  const [data, setData] = useState<StatusData>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next: StatusData = { ...INITIAL };

    // 1) PropReel API → also proves DynamoDB reads; returns cron freshness + S3 check
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

    // 2) Modal render worker
    try {
      const r = await probe(`${WORKER_URL}/health`);
      next.worker = r.ok && r.body?.status === 'healthy'
        ? { state: 'up', detail: `Pipeline online${r.body?.version ? ` · v${r.body.version}` : ''}`, latencyMs: r.latencyMs }
        : { state: 'down', detail: `Unexpected response (${r.status})`, latencyMs: r.latencyMs };
    } catch {
      next.worker = { state: 'down', detail: 'No response from render worker', latencyMs: null };
    }

    // 3) fal.ai health — from the scheduled probe (class-classified, 15 min cadence)
    try {
      const r = await probe(`${WORKER_URL}/probe`);
      const b = r.body || {};
      const cls = String(b.class || '');
      if (b.healthy === true) {
        next.fal = { state: 'up', detail: 'AI models reachable — key valid, account in balance', latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      } else if (cls === 'billing_locked' || cls === 'auth_failed') {
        next.fal = { state: 'down', detail: String(b.detail || cls), latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      } else if (cls === 'no_data' || (!b.healthy && !cls)) {
        next.fal = { state: 'unknown', detail: String(b.detail || 'Probe result unavailable'), latencyMs: null, checkedAt: null };
      } else {
        next.fal = { state: 'degraded', detail: String(b.detail || cls), latencyMs: b.latencyMs ?? null, checkedAt: b.checkedAt || null };
      }
    } catch {
      next.fal = { state: 'unknown', detail: 'Probe unreachable', latencyMs: null, checkedAt: null };
    }

    // 4) Supabase authentication
    if (SUPABASE_ANON_KEY) {
      try {
        const r = await probe(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } });
        next.auth = r.ok
          ? { state: 'up', detail: 'Sign-in service responding', latencyMs: r.latencyMs }
          : { state: 'unknown', detail: `Health endpoint returned ${r.status}`, latencyMs: r.latencyMs };
      } catch {
        next.auth = { state: 'down', detail: 'No response from authentication service', latencyMs: null };
      }
    } else {
      next.auth = { state: 'unknown', detail: 'Not configured on this deployment', latencyMs: null };
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
    { key: 'api', icon: Activity, name: 'PropReel API', description: 'Accounts, credits, projects, billing', ...data.api },
    { key: 'auth', icon: ShieldCheck, name: 'Authentication', description: 'Supabase sign-in service', ...data.auth },
    { key: 'worker', icon: Cpu, name: 'Render pipeline', description: 'Modal video & image processing', ...data.worker },
    { key: 'fal', icon: Mic, name: 'AI models (fal.ai)', description: 'Video, lip-sync, image & text models', ...data.fal },
    { key: 'storage', icon: Cloud, name: 'Media storage', description: 'AWS S3 — uploads and render outputs', state: data.storage.state, detail: data.storage.detail, latencyMs: null },
    { key: 'database', icon: Database, name: 'Database', description: 'DynamoDB — accounts, ledger, projects', state: data.database.state, detail: data.database.detail, latencyMs: null },
  ];

  const states: State[] = [
    ...services.map(s => s.state),
    ...data.crons.map(c => (c.healthy === null ? 'unknown' : c.healthy ? 'up' : 'down') as State),
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
            Live health of the services behind PropReel — checked from your browser, refreshed automatically every minute.
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

      {/* Services */}
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
                {s.detail && s.detail !== 'Checking…' && (
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

      {/* Scheduled jobs */}
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
                  <p className="text-xs text-ink-500 mt-1">No runs recorded yet — monitoring went live 1 Oct 2026; daily jobs record their first run at the next scheduled slot (00:00 / 09:00 UTC).</p>
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

      <p className="text-xs text-ink-500">
        The AI-model check runs automatically every 15 minutes against a tiny test request; everything else is probed live when you open this page. Incidents and maintenance notices are posted on this page.
      </p>
    </div>
  );
}
