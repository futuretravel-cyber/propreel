import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Users, Shield, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const MAX_AGENTS = 10;

/**
 * Agency signup — the person creating the agency becomes its admin/owner.
 * Collects full company details and makes the 10-agent cap explicit up front:
 * agencies with more than 10 agents must create more than one agency.
 */
export default function AgencySignupPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    registrationNumber: '',
    vatNumber: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    reportLogoUrl: '',
    reportHeaderColor: '#6b21a8',
    acknowledgedCap: false,
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  if (!user) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center">
          <Building2 className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">Create your agency</h1>
          <p className="text-ink-400 mt-2">Sign in first — the account you sign in with becomes the agency admin.</p>
          <Link to="/login?next=/agency/signup" className="btn btn-primary w-full mt-6">Sign in to continue</Link>
        </div>
      </div>
    );
  }

  const canSubmit = form.name.trim().length >= 2 && form.acknowledgedCap;

  const submit = async () => {
    if (!canSubmit || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/users?action=agency_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name: form.name.trim(),
          company: {
            registrationNumber: form.registrationNumber.trim() || undefined,
            vatNumber: form.vatNumber.trim() || undefined,
            address: form.address.trim() || undefined,
            contactEmail: form.contactEmail.trim() || undefined,
            contactPhone: form.contactPhone.trim() || undefined,
            website: form.website.trim() || undefined,
          },
          branding: {
            reportLogoUrl: form.reportLogoUrl.trim() || undefined,
            reportHeaderColor: form.reportHeaderColor,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Agency creation failed');
      await refresh();
      toast.success(`${form.name.trim()} is ready — invite up to ${MAX_AGENTS} agents from the Agency tab.`, 'Agency Created!');
      navigate('/dashboard/agency');
    } catch (e: any) {
      toast.error(e.message || 'Agency creation failed');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mt-4">Create your agency</h1>
          <p className="text-ink-400 mt-2">
            You ({user.email}) will be the agency admin — you'll manage agents, credits, and see real-time usage.
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 justify-center">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-10 bg-purple-500' : i < step ? 'w-6 bg-purple-700' : 'w-6 bg-ink-700'}`} />
          ))}
        </div>

        {/* Step 1 — the cap, up front */}
        {step === 1 && (
          <div className="card-dark p-6 space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Users className="w-5 h-5 text-purple-400" /> How agency accounts work</h2>
            <div className="space-y-3 text-sm text-ink-300">
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /><p>Each agent gets <strong className="text-white">their own login</strong> and their own dashboard — videos and images stay in the agent's workspace.</p></div>
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /><p>Agents spend the <strong className="text-white">shared agency credit pool</strong> for render features; you watch every credit in real time.</p></div>
              <div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /><p>You see <strong className="text-white">credit activity only</strong> in your admin dashboard — never the agents' project files.</p></div>
              <div className="flex gap-3 p-3 rounded-lg bg-yellow-950/40 border border-yellow-500/30">
                <Shield className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-200"><strong className="text-yellow-300">Hard limit: {MAX_AGENTS} agents per agency.</strong> If you have more than {MAX_AGENTS} agents, create more than one agency — this keeps the system simple and fast for everyone.</p>
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={form.acknowledgedCap} onChange={e => set('acknowledgedCap', e.target.checked)} className="mt-1 accent-purple-600" />
              <span className="text-sm text-ink-300">I understand my agency is limited to {MAX_AGENTS} agents and that each agent needs their own login.</span>
            </label>
            <button onClick={() => setStep(2)} disabled={!form.acknowledgedCap} className="btn btn-primary w-full disabled:opacity-50">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2 — company details */}
        {step === 2 && (
          <div className="card-dark p-6 space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-purple-400" /> Company details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Agency / company name *</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cape Luxury Properties" maxLength={100} />
              </div>
              <div>
                <label className="label">Company registration no.</label>
                <input className="input" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} placeholder="2016/123456/07" />
              </div>
              <div>
                <label className="label">VAT number</label>
                <input className="input" value={form.vatNumber} onChange={e => set('vatNumber', e.target.value)} placeholder="4123456789" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Registered address</label>
                <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="12 Beach Road, Sea Point, Cape Town, 8005" />
              </div>
              <div>
                <label className="label">Contact email</label>
                <input type="email" className="input" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="admin@agency.co.za" />
              </div>
              <div>
                <label className="label">Contact phone</label>
                <input className="input" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+27 82 123 4567" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Website</label>
                <input className="input" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://agency.co.za" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn btn-secondary">← Back</button>
              <button onClick={() => setStep(3)} disabled={form.name.trim().length < 2} className="btn btn-primary flex-1 disabled:opacity-50">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — report branding (optional) */}
        {step === 3 && (
          <div className="card-dark p-6 space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Zap className="w-5 h-5 text-purple-400" /> Monthly report branding <span className="text-xs font-normal text-ink-500">(optional)</span></h2>
            <p className="text-sm text-ink-400">Your agency gets a branded credit report PDF on the 1st of every month. Use your own logo and colour — separate from the PropReel app branding.</p>
            <div>
              <label className="label">Report logo URL (https)</label>
              <input className="input" value={form.reportLogoUrl} onChange={e => set('reportLogoUrl', e.target.value)} placeholder="https://agency.co.za/logo.png" />
            </div>
            <div>
              <label className="label">Report header colour</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.reportHeaderColor} onChange={e => set('reportHeaderColor', e.target.value)} className="w-12 h-10 rounded-lg bg-transparent cursor-pointer" aria-label="Report header colour" />
                <input className="input flex-1" value={form.reportHeaderColor} onChange={e => set('reportHeaderColor', e.target.value)} placeholder="#6b21a8" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(2)} className="btn btn-secondary">← Back</button>
              <button onClick={submit} disabled={!canSubmit || creating} className="btn btn-primary flex-1 disabled:opacity-60">
                {creating ? 'Creating agency…' : 'Create agency'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-ink-500">
          Need a normal solo account instead? <Link to="/dashboard" className="text-purple-400 hover:underline">Go to your dashboard</Link>
        </p>
      </div>
    </div>
  );
}
