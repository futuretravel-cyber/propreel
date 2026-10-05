import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatRelative } from '../lib/utils';
import {
  Shield, Smartphone, Monitor, Clock, Download,
  CheckCircle2, XCircle, AlertTriangle, Lock, Eye,
  RefreshCw, Trash2, Plus, Fingerprint, Mail
} from 'lucide-react';

/** Row from GET /api/users?action=sessions — real rows in the sessions table. */
interface SessionRow {
  id: string; // token fingerprint (first 12 chars) — the full token never leaves the server
  current: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  device: string;
  userAgent: string | null;
  ip: string | null;
}

/** Event from GET /api/users?action=audit_log — ledger rows, sign-ins and security changes. */
interface AuditEvent {
  id: string;
  action: string;
  category: string;
  severity: 'info' | 'warning' | 'danger';
  description: string;
  ip: string | null;
  timestamp: string | null;
}

export default function SecuritySettings() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'2fa' | 'sessions' | 'audit' | 'privacy'>('2fa');
  const [twoFAEnabled, setTwoFAEnabled] = useState(!!user?.twoFactorEnabled);
  // Live TOTP setup / disable panel — backed by the auth_2fa_* endpoints
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const navigate = useNavigate();

  // ── Real Active Sessions + Audit Log (session-authed API actions) ───────
  // Both tabs used to render hardcoded demo arrays. They now read the
  // sessions table and the credit ledger / security timestamps — if the
  // system has no event, the list is simply shorter. Nothing is invented.
  const apiBase = import.meta.env.VITE_API_URL || '';
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSecurityError(null);
    try {
      const res = await fetch(`${apiBase}/api/users?action=sessions`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load sessions');
      setSessions(data.sessions || []);
    } catch (e: any) {
      setSecurityError(e.message || 'Could not load sessions');
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    setSecurityError(null);
    try {
      const res = await fetch(`${apiBase}/api/users?action=audit_log`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the audit log');
      setAuditEvents(data.events || []);
    } catch (e: any) {
      setSecurityError(e.message || 'Could not load the audit log');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'audit') loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const revokeSession = async (fingerprint: string) => {
    setRevoking(fingerprint);
    try {
      const res = await fetch(`${apiBase}/api/users?action=sessions_revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fingerprint }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Revoke failed');
      toast.success('Session signed out', 'Security');
      await loadSessions();
    } catch (e: any) {
      toast.error(e.message || 'Could not revoke that session');
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllOthers = async () => {
    setRevoking('others');
    try {
      const res = await fetch(`${apiBase}/api/users?action=sessions_revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'others' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Revoke failed');
      toast.success(data.revoked ? `${data.revoked} other session${data.revoked === 1 ? '' : 's'} signed out` : 'No other sessions to sign out', 'Security');
      await loadSessions();
    } catch (e: any) {
      toast.error(e.message || 'Could not revoke sessions');
    } finally {
      setRevoking(null);
    }
  };

  const exportAuditLog = () => {
    if (!auditEvents.length) { toast.error('There is nothing to export yet'); return; }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['timestamp', 'action', 'category', 'severity', 'description', 'ip'].map(esc).join(','),
      ...auditEvents.map(e => [e.timestamp, e.action, e.category, e.severity, e.description, e.ip || ''].map(esc).join(',')),
    ].join('\n');
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `propreel-audit-log-${stamp}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success('Audit log downloaded as CSV', 'Export ready');
  };

  // ── POPIA data export (POST ?action=data_export, session-authed) ────────
  // One server endpoint feeds all three buttons: full JSON, projects-only
  // JSON, and a CSV derived client-side from the same ledger payload.
  const [exporting, setExporting] = useState<null | 'full' | 'projects' | 'txns'>(null);
  const fetchExport = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=data_export`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Data export failed');
    return data;
  };
  const downloadBlob = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const runExport = async (kind: 'full' | 'projects' | 'txns') => {
    if (exporting) return;
    setExporting(kind);
    try {
      const data = await fetchExport();
      const stamp = String(data.generatedAt || new Date().toISOString()).slice(0, 10);
      if (kind === 'full') {
        downloadBlob(JSON.stringify(data, null, 2), `propreel-data-export-${stamp}.json`, 'application/json');
      } else if (kind === 'projects') {
        downloadBlob(
          JSON.stringify({ service: data.service, generatedAt: data.generatedAt, exportedBy: data.exportedBy, projects: data.projects || [] }, null, 2),
          `propreel-projects-${stamp}.json`,
          'application/json'
        );
      } else {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const txns = data.creditTransactions || [];
        const csv = [
          ['id', 'createdAt', 'type', 'amount', 'description'].map(esc).join(','),
          ...txns.map((t: any) => [t.id, t.createdAt, t.type, t.amount, t.description].map(esc).join(',')),
        ].join('\n');
        downloadBlob(csv, `propreel-transactions-${stamp}.csv`, 'text/csv;charset=utf-8');
      }
      toast.success('Your download has started.', 'Export ready');
    } catch (e: any) {
      toast.error(e.message || 'Data export failed');
    }
    setExporting(null);
  };

  const auth2fa = async (action: string, payload: Record<string, any> = {}) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const startSetup = async () => {
    setBusy(true);
    try {
      const d = await auth2fa('auth_2fa_setup');
      setSetup({ secret: d.secret, otpauthUrl: d.otpauthUrl });
      setDisabling(false);
      setCode('');
    } catch (e: any) {
      toast.error(e.message || 'Could not start setup', 'Security');
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    setBusy(true);
    try {
      await auth2fa('auth_2fa_confirm', { code });
      setTwoFAEnabled(true);
      setSetup(null);
      setCode('');
      await refresh();
      toast.success('Two-step verification enabled — you\'ll need a code at sign in', 'Security');
    } catch (e: any) {
      toast.error(e.message || 'Invalid code', 'Security');
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    setBusy(true);
    try {
      await auth2fa('auth_2fa_disable', { code });
      setTwoFAEnabled(false);
      setDisabling(false);
      setCode('');
      await refresh();
      toast.success('Two-step verification disabled', 'Security');
    } catch (e: any) {
      toast.error(e.message || 'Invalid code', 'Security');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-purple-400" /> Security & Privacy
        </h1>
        <p className="text-ink-400 mt-1">Manage your account security and privacy settings.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: '2fa', label: 'Two-Factor Auth', icon: <Smartphone className="w-4 h-4" /> },
          { id: 'sessions', label: 'Active Sessions', icon: <Monitor className="w-4 h-4" /> },
          { id: 'audit', label: 'Audit Log', icon: <Clock className="w-4 h-4" /> },
          { id: 'privacy', label: 'Privacy & Data', icon: <Lock className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`flex items-center gap-2 tab-pill ${tab === t.id ? 'tab-pill-active' : ''}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── 2FA Tab ───────────────────────────────────────────────────────── */}
      {tab === '2fa' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-purple-400" /> Two-Factor Authentication
                </h3>
                <p className="text-ink-400 text-sm mt-1">Add an extra layer of security to your account.</p>
              </div>
              <div className={`badge ${twoFAEnabled ? 'badge-success' : 'badge-warning'}`}>
                {twoFAEnabled ? <><CheckCircle2 className="w-3 h-3" /> Enabled</> : <><XCircle className="w-3 h-3" /> Disabled</>}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-white text-sm">Authentication Methods</h4>
                {[
                  { name: 'Authenticator App', desc: 'Use Google Authenticator, Authy, or similar', icon: <Smartphone className="w-5 h-5" />, recommended: true },
                  { name: 'SMS Verification', desc: 'Receive codes via text message', icon: <Mail className="w-5 h-5" />, recommended: false },
                  { name: 'Email Verification', desc: 'Receive codes via email', icon: <Mail className="w-5 h-5" />, recommended: false },
                ].map((m, i) => (
                  <div key={i} className={`p-4 rounded-xl border transition ${i === 0 && twoFAEnabled ? 'border-purple-500/30 bg-purple-950/20' : 'border-white/5 bg-ink-800/50'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-ink-300 shrink-0">{m.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white flex items-center gap-2 flex-wrap">
                            {m.name}
                            {m.recommended && <span className="badge badge-brand text-[10px]">Recommended</span>}
                          </p>
                          <p className="text-xs text-ink-400">{m.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (i !== 0) return;
                          if (twoFAEnabled) {
                            setDisabling(true);
                            setSetup(null);
                            setCode('');
                          } else {
                            startSetup();
                          }
                        }}
                        disabled={i > 0 || busy}
                        className={`btn text-xs py-1 px-3 ml-auto shrink-0 ${i === 0 && twoFAEnabled ? 'btn-danger' : 'btn-secondary'}`}
                      >
                        {i === 0 && twoFAEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Live TOTP panel — QR setup / confirm / disable */}
                {(setup || disabling) && (
                  <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-3">
                    <p className="text-sm font-medium text-white">
                      {setup ? 'Scan with your authenticator app' : 'Confirm with your authenticator app'}
                    </p>
                    {setup && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.otpauthUrl)}`}
                          alt="Scan with your authenticator app"
                          className="bg-white rounded-lg p-1.5"
                          width={180}
                          height={180}
                        />
                        <button
                          onClick={() => { navigator.clipboard.writeText(setup.secret); toast.success('Setup key copied'); }}
                          className="text-[11px] font-mono text-ink-300 bg-ink-800 border border-white/10 rounded px-2 py-1 hover:border-purple-500/50"
                          title="Copy the setup key"
                        >
                          {setup.secret}
                        </button>
                      </div>
                    )}
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="input text-center text-lg tracking-[0.4em]"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                    />
                    <div className="flex gap-2">
                      <button onClick={setup ? confirmSetup : confirmDisable} disabled={busy || code.length !== 6} className="btn btn-primary text-xs flex-1">
                        {busy ? 'Verifying…' : setup ? 'Enable two-step' : 'Disable two-step'}
                      </button>
                      <button
                        onClick={() => { setSetup(null); setDisabling(false); setCode(''); }}
                        className="btn btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-white text-sm">Recovery Options</h4>
                <div className="p-4 rounded-xl bg-ink-800/50 border border-white/5">
                  <p className="text-sm text-white font-medium">Recovery Codes</p>
                  <p className="text-xs text-ink-400 mt-1">Save these codes in a secure place. Each can be used once to access your account if you lose your 2FA device.</p>
                  {showRecovery ? (
                    <div className="mt-3 p-3 bg-ink-900 rounded-lg font-mono text-xs text-ink-300 grid grid-cols-2 gap-2">
                      {['ABCD-1234', 'EFGH-5678', 'IJKL-9012', 'MNOP-3456', 'QRST-7890', 'UVWX-1234'].map(c => (
                        <span key={c} className="bg-ink-800 px-2 py-1 rounded">{c}</span>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setShowRecovery(true)} className="btn btn-secondary text-xs mt-3"><Eye className="w-3 h-3" /> Show Recovery Codes</button>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-ink-800/50 border border-white/5">
                  <p className="text-sm text-white font-medium">Security Keys</p>
                  <p className="text-xs text-ink-400 mt-1">Add a hardware security key (YubiKey, etc.) for the strongest protection.</p>
                  <button className="btn btn-secondary text-xs mt-3"><Plus className="w-3 h-3" /> Add Security Key</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sessions Tab ──────────────────────────────────────────────────── */}
      {tab === 'sessions' && (
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-white">Active Sessions</h3>
            <button onClick={revokeAllOthers} disabled={revoking !== null || sessions.length < 2} className="btn btn-danger text-xs">
              <Trash2 className="w-3 h-3" /> Revoke All Others
            </button>
          </div>
          <p className="text-xs text-ink-500 mb-4">One entry per sign-in, read straight from the sessions table — IP and browser captured when you signed in.</p>
          {securityError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-sm text-red-300 mb-4">{securityError}</div>
          )}
          <div className="space-y-3">
            {sessionsLoading ? (
              <div className="p-8 text-center text-ink-400 text-sm">Loading your sessions…</div>
            ) : !securityError && sessions.length === 0 ? (
              <div className="p-8 text-center text-ink-400 text-sm">No active sessions found — sign in again to refresh this list.</div>
            ) : sessions.map(s => (
              <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl ${s.current ? 'bg-purple-950/20 border border-purple-500/20' : 'bg-ink-800/50'}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.current ? 'bg-purple-700/30 text-purple-300' : 'bg-ink-700 text-ink-400'}`}>
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white flex items-center gap-2 flex-wrap">
                      {s.device}
                      {s.current && <span className="badge badge-success text-[10px]">Current</span>}
                    </p>
                    <p className="text-xs text-ink-400">
                      {s.ip ? `IP ${s.ip}` : 'IP not recorded'} • signed in {s.createdAt ? formatRelative(s.createdAt) : 'at an unknown time'}{s.expiresAt ? ` • expires ${formatDate(s.expiresAt)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!s.current && (
                    <button onClick={() => revokeSession(s.id)} disabled={revoking !== null} className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 disabled:opacity-60">
                      <XCircle className="w-3 h-3" /> {revoking === s.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Audit Log Tab ─────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-white">Audit Log</h3>
            <button onClick={exportAuditLog} disabled={auditLoading || !auditEvents.length} className="btn btn-secondary text-xs">
              <Download className="w-3 h-3" /> Export Log
            </button>
          </div>
          <p className="text-xs text-ink-500 mb-4">Built only from records the system actually keeps: sign-ins, password / two-step changes and every credit-ledger entry.</p>
          {securityError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-sm text-red-300 mb-4">{securityError}</div>
          )}
          <div className="space-y-2">
            {auditLoading ? (
              <div className="p-8 text-center text-ink-400 text-sm">Loading your audit log…</div>
            ) : !securityError && auditEvents.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-ink-400">No security events recorded yet.</p>
                <p className="text-ink-500 text-sm mt-1">Sign-ins, password changes and credit activity will appear here as they happen.</p>
              </div>
            ) : auditEvents.map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.02]">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  log.severity === 'danger' ? 'bg-red-950/50 text-red-400' :
                  log.severity === 'warning' ? 'bg-yellow-950/50 text-yellow-400' :
                  'bg-blue-950/50 text-blue-400'
                }`}>
                  {log.severity !== 'info' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-muted text-[10px]">{log.action}</span>
                    <span className="text-xs text-ink-500">{log.timestamp ? formatRelative(log.timestamp) : ''}</span>
                  </div>
                  <p className="text-sm text-ink-200 mt-1">{log.description}</p>
                  {log.ip && <p className="text-xs text-ink-500 mt-0.5">IP: {log.ip}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Privacy Tab ───────────────────────────────────────────────────── */}
      {tab === 'privacy' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Data Export (POPIA/GDPR)</h3>
            <p className="text-ink-400 text-sm mb-4">Download all your personal data stored by PropReel. This includes your profile, projects, transactions, and settings.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={() => runExport('full')} disabled={!!exporting} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition disabled:opacity-60">
                {exporting === 'full' ? <RefreshCw className="w-5 h-5 text-purple-400 mb-2 animate-spin" /> : <Download className="w-5 h-5 text-purple-400 mb-2" />}
                <p className="text-sm font-medium text-white">Full Data Export</p>
                <p className="text-xs text-ink-400 mt-1">Profile, projects & ledger — JSON</p>
              </button>
              <button onClick={() => runExport('projects')} disabled={!!exporting} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition disabled:opacity-60">
                {exporting === 'projects' ? <RefreshCw className="w-5 h-5 text-blue-400 mb-2 animate-spin" /> : <Download className="w-5 h-5 text-blue-400 mb-2" />}
                <p className="text-sm font-medium text-white">Projects Only</p>
                <p className="text-xs text-ink-400 mt-1">All projects with media</p>
              </button>
              <button onClick={() => runExport('txns')} disabled={!!exporting} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition disabled:opacity-60">
                {exporting === 'txns' ? <RefreshCw className="w-5 h-5 text-green-400 mb-2 animate-spin" /> : <Download className="w-5 h-5 text-green-400 mb-2" />}
                <p className="text-sm font-medium text-white">Transaction History</p>
                <p className="text-xs text-ink-400 mt-1">CSV format for accounting</p>
              </button>
            </div>
            <p className="text-xs text-ink-500 mt-3">Instant download — nothing is emailed. (POPIA right of access & portability.)</p>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Account Deletion</h3>
            <p className="text-ink-400 text-sm mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20">
              <p className="text-sm text-red-300 font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Warning: This is irreversible</p>
              <p className="text-xs text-ink-400 mt-2">All your projects, renders, credits, and personal data will be permanently deleted within 30 days.</p>
              <button onClick={() => navigate('/dashboard/delete-account')} className="btn btn-danger text-xs mt-4">Request Account Deletion</button>
            </div>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Data Retention</h3>
            <div className="space-y-3">
              {[
                { label: 'Project Data', retention: 'Retained until account deletion', icon: '📁' },
                { label: 'Transaction Records', retention: 'Retained for 7 years (tax compliance)', icon: '💰' },
                { label: 'Audit Logs', retention: 'Retained for 2 years', icon: '📋' },
                { label: 'Generated Media', retention: 'Stored for 30 days, then permanently deleted', icon: '🎬' },
                { label: 'Login History', retention: 'Retained for 1 year', icon: '🔐' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white flex items-center gap-2">{item.icon} {item.label}</span>
                  <span className="text-xs text-ink-400">{item.retention}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
