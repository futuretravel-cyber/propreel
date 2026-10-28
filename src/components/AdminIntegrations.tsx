import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, XCircle, Zap, Database, CreditCard, MessageCircle, Headphones, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { RENDER_ENDPOINT } from '../lib/renderEndpoint';

// ─── Real service status. These integrations (WhatsApp Business, live chat,
// status page hosting, scheduled reports) are not built yet — this panel
// shows what actually exists and its live health instead of dead forms. ────

export default function AdminIntegrations() {
  const [modal, setModal] = useState<any>(null);
  const [probe, setProbe] = useState<any>(null);
  const [api, setApi] = useState<'ok' | 'fail' | 'loading'>('loading');

  useEffect(() => {
    fetch(`${RENDER_ENDPOINT}/health`)
      .then(r => r.json()).then(setModal).catch(() => setModal(null));
    fetch(`${RENDER_ENDPOINT}/probe`)
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
      name: 'Render worker',
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      detail: modal ? `${modal.model} · v${modal.version}` : 'unreachable',
      ok: !!modal,
    },
    {
      name: 'AI provider (images, video, text)',
      icon: <Activity className="w-4 h-4 text-purple-400" />,
      detail: probe?.class === 'healthy'
        ? `healthy · ${probe.latencyMs}ms`
        : probe?.detail || 'checking…',
      ok: probe?.class === 'healthy',
    },
    {
      name: 'Platform API & database',
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
    { name: 'Scheduled PDF Reports', note: 'built — agency reports generate on the 1st; see Agency → Reports' },
  ];

  const { user } = useAuth();
  const toast = useToast();
  const [flags, setFlags] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/users?action=feature_flags').then(r => r.json()).then(d => setFlags(d.flags)).catch(() => {});
  }, []);

  const saveFlags = async (next: any) => {
    setFlags(next);
    setSaving(true);
    try {
      const res = await fetch('/api/users?action=feature_flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setFlags(data.flags);
      toast.success('Integration settings saved', 'Saved');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className={`relative w-12 h-6 rounded-full transition ${on ? 'bg-green-600' : 'bg-ink-700'}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${on ? 'left-7' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Service Integrations</h1>
        <p className="text-ink-400 text-sm mt-1">Live health of every system PropReel depends on. Secrets are managed in Vercel environment variables and render-platform secrets — never in this UI.</p>
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
        <div className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-purple-400" />
            <div>
              <h4 className="font-semibold text-white text-sm">Public Status Page</h4>
              <p className="text-xs text-ink-400 mt-0.5">Live system health, cron freshness and incident notices</p>
            </div>
          </div>
          <Link to="/status" className="btn btn-secondary text-xs py-1.5 px-3">Open <ArrowUpRight className="w-3 h-3" /></Link>
        </div>
      </div>

      {/* ── Activatable integrations ─────────────────────────────────── */}
      <div className="card-dark p-6 space-y-5">
        <h3 className="font-semibold text-white text-sm">Activatable integrations</h3>

        {/* WhatsApp Business (click-to-chat) */}
        {flags && (
          <div className="bg-ink-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-4 h-4 text-green-400" />
                <div>
                  <h4 className="font-semibold text-white text-sm">WhatsApp Business</h4>
                  <p className="text-xs text-ink-400 mt-0.5">Floating click-to-chat button on public pages. (Full Business API needs Meta verification — this works today.)</p>
                </div>
              </div>
              <Toggle on={flags.whatsapp.enabled} onToggle={() => saveFlags({ ...flags, whatsapp: { ...flags.whatsapp, enabled: !flags.whatsapp.enabled } })} />
            </div>
            {flags.whatsapp.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">WhatsApp number (with country code)</label>
                  <input className="input" value={flags.whatsapp.number} placeholder="+27 82 123 4567" onChange={e => setFlags({ ...flags, whatsapp: { ...flags.whatsapp, number: e.target.value } })} />
                </div>
                <div>
                  <label className="label">Pre-filled message</label>
                  <input className="input" value={flags.whatsapp.message} onChange={e => setFlags({ ...flags, whatsapp: { ...flags.whatsapp, message: e.target.value } })} />
                </div>
                <div><button onClick={() => saveFlags(flags)} disabled={saving} className="btn btn-primary text-xs">Save number</button></div>
              </div>
            )}
          </div>
        )}

        {/* Live chat (Crisp / Intercom) */}
        {flags && (
          <div className="bg-ink-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Headphones className="w-4 h-4 text-blue-400" />
                <div>
                  <h4 className="font-semibold text-white text-sm">Live Chat Widget</h4>
                  <p className="text-xs text-ink-400 mt-0.5">Embeds Crisp or Intercom on public pages using your workspace ID.</p>
                </div>
              </div>
              <Toggle on={flags.liveChat.enabled} onToggle={() => saveFlags({ ...flags, liveChat: { ...flags.liveChat, enabled: !flags.liveChat.enabled } })} />
            </div>
            {flags.liveChat.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Provider</label>
                  <select className="input" value={flags.liveChat.provider} onChange={e => setFlags({ ...flags, liveChat: { ...flags.liveChat, provider: e.target.value } })}>
                    <option value="crisp">Crisp</option>
                    <option value="intercom">Intercom</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">{flags.liveChat.provider === 'crisp' ? 'Crisp Website ID' : 'Intercom App ID'}</label>
                  <input className="input" value={flags.liveChat.websiteId} placeholder={flags.liveChat.provider === 'crisp' ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'abc123xy'} onChange={e => setFlags({ ...flags, liveChat: { ...flags.liveChat, websiteId: e.target.value } })} />
                </div>
                <div><button onClick={() => saveFlags(flags)} disabled={saving} className="btn btn-primary text-xs">Save widget</button></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-dark p-6">
        <h3 className="font-semibold text-white text-sm mb-3">On the roadmap</h3>
        <div className="space-y-2">
          {notBuilt.map(s => (
            <div key={s.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-ink-300">{s.name}</span>
              <span className="badge badge-muted">NOTE</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
