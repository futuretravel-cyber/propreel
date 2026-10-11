import { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, AlertTriangle, RefreshCw, Copy, ShieldCheck } from 'lucide-react';
import { SERVICE_KEYS } from '../../lib/serviceKeys';
import { useToast } from '../context/ToastContext';

interface Status {
  services: Array<{ id: string; label: string; blurb: string; fields: Array<{ name: string; label: string }> }>;
  configured: Record<string, boolean>;
  plumbing: { vercelToken: boolean; projectId: boolean; adminApiKey: boolean };
}

interface LegResult {
  vercel: Array<{ key: string; result?: string; error?: string }>;
  modal: Array<{ secret: string; ok: boolean; via?: string; error?: string }>;
  redeploy: { ok: boolean; url?: string; error?: string } | null;
  envLines: string;
}

/**
 * Admin → API Keys: paste a new key for any service the platform runs on
 * and it propagates to the Vercel project env (+ production redeploy) and
 * the matching Modal secret through the worker's bearer-gated route. The
 * local .env can never be written from here — the tab hands back the exact
 * KEY=value lines to paste instead. Values are write-only: this panel never
 * receives a stored key back from the server.
 */
export default function AdminApiKeys() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string; envLines?: string }>>({});
  const [redeploy, setRedeploy] = useState(true);
  const [tokenBootstrap, setTokenBootstrap] = useState({ id: '', secret: '' });

  const load = () =>
    fetch('/api/users?action=admin_api_keys')
      .then(r => r.json())
      .then((d: Status & { success?: boolean; error?: string }) => { if (d?.services) setStatus(d); else toast.error(d?.error || 'Failed to load'); })
      .catch(() => toast.error('Failed to reach /api/adminApiKeys'));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (serviceId: string) => {
    const spec = SERVICE_KEYS.find(s => s.id === serviceId);
    if (!spec) return;
    const payload: Record<string, string> = {};
    for (const f of spec.fields) if ((values[f.name] || '').trim()) payload[f.name] = values[f.name].trim();
    if (!Object.keys(payload).length) { toast.info('Type a new value first'); return; }
    setSaving(serviceId);
    try {
      const res = await fetch('/api/users?action=admin_api_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          values: payload,
          redeploy,
          // One-time bootstrap: the worker's ambient identity may be denied
          // on the very first call; the token lets it fall back and persist.
          ...(tokenBootstrap.id && tokenBootstrap.secret
            ? { modal_token_id: tokenBootstrap.id, modal_token_secret: tokenBootstrap.secret }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const legs: string[] = [];
      let ok = true;
      for (const v of (data.vercel || [])) legs.push(v.error ? (ok = false, `Vercel ${v.key}: ${v.error}`) : `Vercel ${v.key}: ${v.result}`);
      for (const m of (data.modal || [])) legs.push(m.ok ? `Modal ${m.secret}: updated (${m.via})` : (ok = false, `Modal ${m.secret}: ${m.error}`));
      if (data.redeploy) legs.push(data.redeploy.ok ? `Redeploying: ${data.redeploy.url}` : (ok = false, `Redeploy: ${data.redeploy.error}`));
      setResults(r => ({ ...r, [serviceId]: { ok, text: legs.join(' · '), envLines: data.envLines } }));
      setValues(v => { const n = { ...v }; for (const k of Object.keys(payload)) n[k] = ''; return n; });
      if (ok) toast.success(`${spec.label} updated`); else toast.error(`${spec.label} updated with errors — see details`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setSaving(null);
    }
  };

  const copyEnv = (lines: string) => navigator.clipboard.writeText(lines).then(() => toast.success('Copied — paste into your local .env'));

  const missing = status && (!status.plumbing.vercelToken || !status.plumbing.adminApiKey);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-bold text-white">Service API Keys</h2>
      </div>
      <p className="text-xs text-ink-400">
        Saving a key updates the Vercel project env (and redeploys so it takes effect) and the matching Modal secret.
        Keys are write-only — this panel never receives stored values back. Your local .env is delivered as copyable lines.
      </p>

      {missing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-sm text-amber-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> One-time setup required</p>
          <ul className="text-xs text-ink-300 space-y-1 list-disc pl-5">
            {!status?.plumbing.vercelToken && <li>Add <code>VERCEL_TOKEN</code> (and optionally <code>VERCEL_TEAM_ID</code>) to the Vercel project env — a token with project + deployment scope.</li>}
            {!status?.plumbing.adminApiKey && <li>Add <code>ADMIN_API_KEY</code> to the Vercel project env and to the Modal secret <code>admin-api</code> (same random value).</li>}
            <li>Create the Modal secret <code>modal-admin-creds</code> (MODAL_TOKEN_ID / MODAL_TOKEN_SECRET) — or paste the token once under Advanced below and the worker persists it.</li>
          </ul>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink-300">
        <input type="checkbox" checked={redeploy} onChange={e => setRedeploy(e.target.checked)} className="rounded" />
        Trigger a production redeploy after a Vercel env change (env vars only apply to new deployments)
      </label>

      <div className="space-y-4">
        {(status?.services || SERVICE_KEYS).map(s => (
          <div key={s.id} className="bg-white/5 rounded-xl p-4 space-y-3">
            <div>
              <p className="font-semibold text-white text-sm">{s.label}</p>
              <p className="text-xs text-ink-500">{s.blurb}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {s.fields.map(f => (
                <div key={f.name}>
                  <label className="text-xs text-ink-400">{f.label} <span className="text-ink-600">({f.name})</span></label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="input mt-1"
                    placeholder={status?.configured?.[f.name] ? '•••••••• (configured)' : 'paste value'}
                    value={values[f.name] || ''}
                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => save(s.id)} disabled={saving !== null} className="btn btn-primary text-sm">
                {saving === s.id ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : 'Save & propagate'}
              </button>
              {status?.configured && s.fields.some(f => status.configured[f.name]) === false && (
                <span className="text-xs text-ink-500">not configured yet</span>
              )}
            </div>
            {results[s.id] && (
              <div className={`text-xs rounded-lg p-3 border ${results[s.id].ok ? 'bg-green-500/10 border-green-500/30 text-green-200' : 'bg-red-500/10 border-red-500/30 text-red-200'}`}>
                <p className="flex items-center gap-1">
                  {results[s.id].ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                  {results[s.id].text}
                </p>
                {results[s.id].envLines && (
                  <button onClick={() => copyEnv(results[s.id].envLines!)} className="mt-2 inline-flex items-center gap-1 underline hover:no-underline">
                    <Copy className="w-3 h-3" /> Copy the .env lines for this update
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <details className="bg-white/5 rounded-xl p-4">
        <summary className="text-sm text-ink-300 cursor-pointer flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-purple-400" /> Advanced — one-time Modal token bootstrap</summary>
        <p className="text-xs text-ink-500 mt-2">
          If the worker's own identity cannot update a secret, supply your Modal token once (Account → API tokens).
          The worker persists it into the <code>modal-admin-creds</code> secret so future saves need nothing here.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <input type="password" autoComplete="off" className="input" placeholder="MODAL_TOKEN_ID" value={tokenBootstrap.id} onChange={e => setTokenBootstrap(t => ({ ...t, id: e.target.value }))} />
          <input type="password" autoComplete="off" className="input" placeholder="MODAL_TOKEN_SECRET" value={tokenBootstrap.secret} onChange={e => setTokenBootstrap(t => ({ ...t, secret: e.target.value }))} />
        </div>
      </details>
    </div>
  );
}
