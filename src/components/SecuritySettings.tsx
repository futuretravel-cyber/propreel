import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatRelative } from '../lib/utils';
import {
  Shield, Smartphone, Key, Monitor, Globe, Clock, Download,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Eye, EyeOff,
  RefreshCw, Trash2, Plus, Fingerprint, Mail, QrCode
} from 'lucide-react';

const sessions = [
  { id: 1, device: 'Chrome on MacOS', ip: '41.76.xxx.xxx', location: 'Cape Town, SA', lastActive: 'Now', current: true },
  { id: 2, device: 'Safari on iPhone', ip: '41.76.xxx.xxx', location: 'Cape Town, SA', lastActive: '2 hours ago', current: false },
  { id: 3, device: 'Firefox on Windows', ip: '197.98.xxx.xxx', location: 'Johannesburg, SA', lastActive: '3 days ago', current: false },
];

const auditLogs = [
  { id: 1, action: 'LOGIN', description: 'Successful login from Chrome on MacOS', ip: '41.76.xxx.xxx', timestamp: '2025-03-14T10:30:00Z', severity: 'info' },
  { id: 2, action: 'CREDITS_PURCHASED', description: 'Purchased 100 credits via Paystack', ip: '41.76.xxx.xxx', timestamp: '2025-03-14T10:32:00Z', severity: 'info' },
  { id: 3, action: 'RENDER_STARTED', description: 'Started Cinematic render for "Luxury Villa"', ip: '41.76.xxx.xxx', timestamp: '2025-03-14T11:00:00Z', severity: 'info' },
  { id: 4, action: 'SETTINGS_CHANGED', description: 'Updated API key for Fal.ai', ip: '41.76.xxx.xxx', timestamp: '2025-03-13T15:00:00Z', severity: 'warning' },
  { id: 5, action: 'FAILED_LOGIN', description: 'Failed login attempt — incorrect password', ip: '102.89.xxx.xxx', timestamp: '2025-03-12T08:00:00Z', severity: 'danger' },
  { id: 6, action: 'PASSWORD_CHANGED', description: 'Password updated successfully', ip: '41.76.xxx.xxx', timestamp: '2025-03-10T14:00:00Z', severity: 'warning' },
  { id: 7, action: 'MEMBER_INVITED', description: 'Invited priya@demorealty.co.za to agency', ip: '41.76.xxx.xxx', timestamp: '2025-03-09T09:00:00Z', severity: 'info' },
  { id: 8, action: 'DATA_EXPORT', description: 'Exported account data (GDPR request)', ip: '41.76.xxx.xxx', timestamp: '2025-03-08T16:00:00Z', severity: 'info' },
];

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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-ink-300">{m.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-white flex items-center gap-2">
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
                        className={`btn text-xs py-1 px-3 ${i === 0 && twoFAEnabled ? 'btn-danger' : 'btn-secondary'}`}
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Active Sessions</h3>
            <button onClick={() => toast.success('All other sessions terminated', 'Security')} className="btn btn-danger text-xs">
              <Trash2 className="w-3 h-3" /> Revoke All Others
            </button>
          </div>
          <div className="space-y-3">
            {sessions.map(s => (
              <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl ${s.current ? 'bg-purple-950/20 border border-purple-500/20' : 'bg-ink-800/50'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.current ? 'bg-purple-700/30 text-purple-300' : 'bg-ink-700 text-ink-400'}`}>
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      {s.device}
                      {s.current && <span className="badge badge-success text-[10px]">Current</span>}
                    </p>
                    <p className="text-xs text-ink-400">{s.location} • {s.ip}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-500">{s.lastActive}</span>
                  {!s.current && (
                    <button onClick={() => toast.success('Session revoked')} className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Revoke
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Audit Log</h3>
            <button className="btn btn-secondary text-xs"><Download className="w-3 h-3" /> Export Log</button>
          </div>
          <div className="space-y-2">
            {auditLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.02]">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  log.severity === 'danger' ? 'bg-red-950/50 text-red-400' :
                  log.severity === 'warning' ? 'bg-yellow-950/50 text-yellow-400' :
                  'bg-blue-950/50 text-blue-400'
                }`}>
                  {log.severity === 'danger' ? <AlertTriangle className="w-4 h-4" /> :
                   log.severity === 'warning' ? <AlertTriangle className="w-4 h-4" /> :
                   <CheckCircle2 className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-muted text-[10px]">{log.action}</span>
                    <span className="text-xs text-ink-500">{formatRelative(log.timestamp)}</span>
                  </div>
                  <p className="text-sm text-ink-200 mt-1">{log.description}</p>
                  <p className="text-xs text-ink-500 mt-0.5">IP: {log.ip}</p>
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
              <button onClick={() => toast.success('Data export started. You\'ll receive an email when ready.', 'Export')} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition">
                <Download className="w-5 h-5 text-purple-400 mb-2" />
                <p className="text-sm font-medium text-white">Full Data Export</p>
                <p className="text-xs text-ink-400 mt-1">All data in JSON format</p>
              </button>
              <button onClick={() => toast.success('Project export started.')} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition">
                <Download className="w-5 h-5 text-blue-400 mb-2" />
                <p className="text-sm font-medium text-white">Projects Only</p>
                <p className="text-xs text-ink-400 mt-1">All projects with media</p>
              </button>
              <button onClick={() => toast.success('Transaction history exported.')} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-left transition">
                <Download className="w-5 h-5 text-green-400 mb-2" />
                <p className="text-sm font-medium text-white">Transaction History</p>
                <p className="text-xs text-ink-400 mt-1">CSV format for accounting</p>
              </button>
            </div>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Account Deletion</h3>
            <p className="text-ink-400 text-sm mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20">
              <p className="text-sm text-red-300 font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Warning: This is irreversible</p>
              <p className="text-xs text-ink-400 mt-2">All your projects, renders, credits, and personal data will be permanently deleted within 30 days.</p>
              <button className="btn btn-danger text-xs mt-4">Request Account Deletion</button>
            </div>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Data Retention</h3>
            <div className="space-y-3">
              {[
                { label: 'Project Data', retention: 'Retained until account deletion', icon: '📁' },
                { label: 'Transaction Records', retention: 'Retained for 7 years (tax compliance)', icon: '💰' },
                { label: 'Audit Logs', retention: 'Retained for 2 years', icon: '📋' },
                { label: 'Generated Media', retention: 'Retained for 90 days after project deletion', icon: '🎬' },
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
