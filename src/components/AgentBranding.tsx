import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Upload, User, X } from 'lucide-react';
import { useCredit, type AgentProfile } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { uploadImagesForAI } from '../lib/propertyListing';

/**
 * Agent Branding tab — mirrors base44's /brand-kits page.
 * "Agent Profile branding": save a profile once (photo, logo, contact
 * details) and auto-apply it to every video render.
 */

type Tab = 'details' | 'photo' | 'logo';

const emptyDraft = {
  profileName: '',
  fullName: '',
  email: '',
  phone: '',
  photoUrl: '',
  logoUrl: '',
  isDefault: false,
  includeBranding: true,
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition ${on ? 'bg-purple-600' : 'bg-ink-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function ProfileModal({
  initial,
  onClose,
  onSave,
}: {
  initial: AgentProfile | null;
  onClose: () => void;
  onSave: (p: AgentProfile) => Promise<void>;
}) {
  const { user } = useCredit();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('details');
  const [d, setD] = useState({ ...emptyDraft, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'photo' | 'logo' | null>(null);
  const set = (k: keyof typeof emptyDraft) => (e: any) => setD(prev => ({ ...prev, [k]: e.target.value }));

  const upload = async (kind: 'photo' | 'logo', file: File | undefined) => {
    if (!file) return;
    setUploading(kind);
    try {
      const [url] = await uploadImagesForAI([file] as unknown as FileList, user?.id, 1);
      setD(prev => ({ ...prev, [kind === 'photo' ? 'photoUrl' : 'logoUrl']: url }));
      toast.success(`${kind === 'photo' ? 'Photo' : 'Logo'} uploaded`);
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!d.profileName.trim()) {
      toast.error('Give the profile a name (e.g. Smit Properties – Johan)', 'Profile name required');
      setTab('details');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initial?.id || `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        profileName: d.profileName.trim(),
        fullName: d.fullName.trim(),
        email: d.email.trim(),
        phone: d.phone.trim(),
        photoUrl: d.photoUrl || undefined,
        logoUrl: d.logoUrl || undefined,
        isDefault: d.isDefault,
        includeBranding: d.includeBranding,
      });
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Could not save the agent profile');
    } finally {
      setSaving(false);
    }
  };

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'photo', label: 'Agent Photo' },
    { id: 'logo', label: 'Company Logo' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-white text-ink-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-center relative px-6 pt-6">
          <h2 className="text-xl font-bold">{initial ? 'Edit Agent Profile' : 'Create Agent Profile'}</h2>
          <button onClick={onClose} aria-label="Close" className="absolute right-5 top-6 text-ink-400 hover:text-ink-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented tabs */}
        <div className="mx-6 mt-4 grid grid-cols-3 gap-1 bg-ink-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {tab === 'details' && (
            <>
              <div className="space-y-1">
                <label className="label-light">Profile name</label>
                <input className="input-light" placeholder="e.g. Smit Properties – Johan" value={d.profileName} onChange={set('profileName')} />
              </div>
              <div className="space-y-1">
                <label className="label-light">Agent full name</label>
                <input className="input-light" placeholder="Johan Smit" value={d.fullName} onChange={set('fullName')} />
              </div>
              <div className="space-y-1">
                <label className="label-light">Email</label>
                <input className="input-light" type="email" placeholder="johan@example.co.za" value={d.email} onChange={set('email')} />
              </div>
              <div className="space-y-1">
                <label className="label-light">Phone</label>
                <input className="input-light" placeholder="+27 82 123 4567" value={d.phone} onChange={set('phone')} />
              </div>

              <div className="flex items-center justify-between bg-ink-50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-ink-700">Set as default agent profile</span>
                <Toggle on={d.isDefault} onChange={v => setD(p => ({ ...p, isDefault: v }))} label="Default agent profile" />
              </div>

              <div className="flex items-start justify-between gap-4 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">Include Agent Branding in Video</p>
                  <p className="text-xs text-ink-600 mt-0.5">
                    When enabled, your photo, logo, and contact details will appear in the final video output.
                  </p>
                </div>
                <Toggle on={d.includeBranding} onChange={v => setD(p => ({ ...p, includeBranding: v }))} label="Include branding in video" />
              </div>
            </>
          )}

          {tab === 'photo' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-ink-600 text-left">Upload a profile photo for the agent. This appears on the video outro card.</p>
              <div className="mx-auto w-28 h-28 rounded-full bg-ink-100 overflow-hidden flex items-center justify-center">
                {d.photoUrl ? (
                  <img src={d.photoUrl} alt="Agent" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-ink-300" />
                )}
              </div>
              <label className={`btn btn-quiet text-sm cursor-pointer ${uploading === 'photo' ? 'opacity-60' : ''}`}>
                {uploading === 'photo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={e => upload('photo', e.target.files?.[0])} disabled={uploading === 'photo'} />
              </label>
            </div>
          )}

          {tab === 'logo' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-ink-600 text-left">Upload your company or agency logo. It appears beside your name on the video outro card.</p>
              <div className="mx-auto w-36 h-24 rounded-xl bg-ink-100 overflow-hidden flex items-center justify-center p-2">
                {d.logoUrl ? (
                  <img src={d.logoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-ink-400">No logo yet</span>
                )}
              </div>
              <label className={`btn btn-quiet text-sm cursor-pointer ${uploading === 'logo' ? 'opacity-60' : ''}`}>
                {uploading === 'logo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Logo
                <input type="file" accept="image/*" className="hidden" onChange={e => upload('logo', e.target.files?.[0])} disabled={uploading === 'logo'} />
              </label>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button onClick={save} disabled={saving || !!uploading} className="btn btn-primary w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Agent Profile
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentBranding() {
  const { user, refresh } = useCredit();
  const toast = useToast();
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Latest saved list — the auth refresh right after a write can hit an
  // eventually-consistent read and briefly flip the UI back to the old value.
  const [override, setOverride] = useState<AgentProfile[] | null>(null);

  const profiles: AgentProfile[] = override ?? user?.agentProfiles ?? [];

  const persist = async (list: AgentProfile[]) => {
    if (!user) throw new Error('You must be signed in');
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, updates: { agentProfiles: list } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your agent profiles');
      setOverride(list);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (p: AgentProfile) => {
    const next = profiles
      .filter(x => x.id !== p.id)
      .map(x => (p.isDefault ? { ...x, isDefault: false } : x));
    await persist([...next, p]);
    toast.success('Agent profile saved', p.includeBranding ? 'Branding applied to videos' : 'Saved');
  };

  const handleDelete = async (p: AgentProfile) => {
    if (!window.confirm(`Delete "${p.profileName}"? This cannot be undone.`)) return;
    try {
      await persist(profiles.filter(x => x.id !== p.id));
      toast.success('Agent profile deleted');
    } catch (e: any) {
      toast.error(e.message || 'Could not delete the profile');
    }
  };

  const toggleBranding = async (p: AgentProfile) => {
    const next = profiles.map(x => (x.id === p.id ? { ...x, includeBranding: !x.includeBranding } : x));
    try {
      await persist(next);
    } catch (e: any) {
      toast.error(e.message || 'Could not update the profile');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Agent Profile Branding</h1>
        <p className="text-sm text-ink-400">Save your branding once — auto-apply to every video.</p>
      </div>

      <button
        onClick={() => { setEditing(null); setOpen(true); }}
        disabled={saving}
        className="btn btn-primary w-full text-base"
      >
        <Plus className="w-5 h-5" /> New Agent Profile
      </button>

      {profiles.length === 0 && (
        <div className="card-light p-8 text-center">
          <p className="text-ink-900 font-medium">No agent profiles yet</p>
          <p className="text-ink-600 text-sm mt-1">Create your first profile — your photo, logo and contact details will apply to every render.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profiles.map(p => (
          <div key={p.id} className="card-light p-5">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-full bg-ink-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.fullName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-ink-400" />
                )}
              </span>
              <div className="min-w-0 flex items-center gap-2">
                {p.logoUrl && <img src={p.logoUrl} alt="" className="h-6 max-w-[80px] object-contain" />}
                <span className="font-bold text-ink-900 truncate">{p.profileName}</span>
                {p.isDefault && (
                  <span className="badge badge-brand flex-shrink-0">Default</span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-0.5 text-sm text-ink-700">
              {p.fullName && <p>{p.fullName}</p>}
              {p.email && <p>{p.email}</p>}
              {p.phone && <p>{p.phone}</p>}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => { setEditing(p); setOpen(true); }}
                className="btn btn-quiet text-sm flex-1"
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleBranding(p)}
                  title={p.includeBranding ? 'Branding is included in videos — click to turn off' : 'Branding is off — click to include it in videos'}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                    p.includeBranding !== false
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-ink-50 text-ink-500 border-ink-200'
                  }`}
                >
                  {p.includeBranding !== false ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  aria-label={`Delete ${p.profileName}`}
                  className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <ProfileModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
