import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, Zap, Database, CreditCard } from 'lucide-react';

// ─── Real service status. These integrations (WhatsApp Business, live chat,
// status page hosting, scheduled reports) are not built yet — this panel
// shows what actually exists and its live health instead of dead forms. ────

export default function AdminIntegrations() {
  const [modal, setModal] = useState<any>(null);
  const [probe, setProbe] = useState<any>(null);
  const [api, setApi] = useState<'ok' | 'fail' | 'loading'>('loading');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run'}/health`)
      .then(r => r.json()).then(setModal).catch(() => setModal(null));
    fetch(`${import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run'}/probe`)
      .then(r => r.json()).then(setProbe).catch(() => setProbe(null));
    fetch('/api/music').then(r => setApi(r.ok ? 'ok' : 'fail')).catch(() => setApi('fail'));
  }, []);

  const Pill = ({ ok, label }: { ok: boolean | null; label?: string }) => (
    ok === null || ok === undefined
      ? <span className="badge badge-muted">{label || 'ENV-MANAGED'}</span>
      : ok
        ? <span className="badge badge-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OPERATIONAL</span>
        : <span className="badge badge-danger flex items-center gap-1"><XCircle className="w-3 h-3" /> DOWN</span>
  );

  const live = [
    {
      name: 'Modal Render Worker',
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      detail: modal ? `${modal.model} · v${modal.version}` : 'unreachable',
      ok: !!modal,
    },
    {
      name: 'fal.ai (images, video, LLM)',
      icon: <Activity className="w-4 h-4 text-purple-400" />,
      detail: probe?.class === 'healthy'
        ? `healthy · ${probe.latencyMs}ms`
        : probe?.detail || 'checking…',
      ok: probe?.class === 'healthy',
    },
    {
      name: 'Vercel API + DynamoDB',
      icon: <Database className="w-4 h-4 text-purple-400" />,
      detail: api === 'ok' ? 'serverless functions reachable' : api === 'fail' ? 'API unreachable' : 'checking…',
      ok: api === 'ok',
    },
    {
      name: 'Paystack Payments',
      icon: <CreditCard className="w-4 h-4 text-purple-400" />,
      detail: 'checkout + webhook, keyed via PAYSTACK_SECRET_KEY',
      ok: null as unknown as boolean,
    },
  ];

  const notBuilt = [
    { name: 'WhatsApp Business API', note: 'planned — needs Meta business verification' },
    { name: 'Live Chat Widget', note: 'planned — requires a provider (Crisp/Intercom)' },
    { name: 'Public Status Page', note: 'planned — current status lives here in the admin panel' },
    { name: 'Scheduled PDF Reports', note: 'planned — usage data is available in the credits ledger' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Service Integrations</h1>
        <p className="text-ink-400 text-sm mt-1">Live health of every system PropReel depends on. Secrets are managed in Vercel environment variables and Modal secrets — never in this UI.</p>
      </div>

      <div className="space-y-3">
        {live.map(s => (
          <div key={s.name} className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {s.icon}
              <div>
                <h4 className="font-semibold text-white text-sm">{s.name}</h4>
                <p className="text-xs text-ink-400 mt-0.5">{s.detail}</p>
              </div>
            </div>
            <Pill ok={s.ok} />
          </div>
        ))}
      </div>

      <div className="card-dark p-6">
        <h3 className="font-semibold text-white text-sm mb-3">On the roadmap</h3>
        <div className="space-y-2">
          {notBuilt.map(s => (
            <div key={s.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-ink-300">{s.name}</span>
              <span className="badge badge-muted">NOT BUILT</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
