import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { track } from '../lib/analytics';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PLANS, SIGNUP_BONUS } from '../lib/constants';
import { formatZar } from '../lib/utils';
import { Check, ArrowRight, ArrowLeft, Sparkles, Building2, User, CreditCard, Shield } from 'lucide-react';

type Step = 'plan' | 'details' | 'payment';

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('plan');
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const p = searchParams.get('plan')?.toUpperCase();
    return p && PLANS.some(plan => plan.id === p) ? p : 'PROFESSIONAL';
  });
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>(() =>
    searchParams.get('cycle')?.toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  );
  // Deep-linked plans (from pricing CTAs) skip straight to account details
  useEffect(() => {
    if (searchParams.get('plan')) setStep('details');
  }, [searchParams]);
  // Remember referral code from ?ref= across the multi-step flow
  const referralCode = searchParams.get('ref') || '';
  const [isAgency, setIsAgency] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', phone: '',
    agencyName: '', companyName: '', companyReg: '', companyVat: '', companyAddress: '',
    agreed: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();

  const plan = PLANS.find(p => p.id === selectedPlan)!;
  const price = cycle === 'ANNUAL' ? plan.annualZar : plan.monthlyZar;

  const handleNext = () => {
    if (step === 'plan') {
      if (isAgency && selectedPlan !== 'AGENCY') {
        setError('Agency accounts require the Agency plan');
        return;
      }
      setError('');
      setStep('details');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreed) { setError('You must acknowledge the AI disclaimer'); return; }
    setLoading(true);
    setError('');
    try {
      await register({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phone: formData.phone,
        agencyName: isAgency ? formData.companyName : formData.agencyName,
        planId: selectedPlan as any,
        cycle,
        aiAcknowledged: formData.agreed,
        companyName: formData.companyName,
        companyReg: formData.companyReg,
        companyVat: formData.companyVat,
        companyAddress: formData.companyAddress,
        referralCode: referralCode || undefined,
      });
      toast.success(`Welcome! You've received ${SIGNUP_BONUS} free credits!`, 'Account Created');
      track('signup_completed', { plan: selectedPlan, cycle });
      navigate(`/payment?plan=${selectedPlan}&cycle=${cycle}&price=${price}`);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {(['plan', 'details', 'payment'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s ? 'bg-purple-700 text-white' :
                (['plan', 'details', 'payment'].indexOf(step) > i) ? 'bg-green-600 text-white' :
                'bg-ink-800 text-ink-500'
              }`}>
                {(['plan', 'details', 'payment'].indexOf(step) > i) ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${step === s ? 'text-white font-medium' : 'text-ink-500'}`}>
                {s === 'plan' ? 'Choose Plan' : s === 'details' ? 'Your Details' : 'Payment'}
              </span>
              {i < 2 && <div className="w-8 h-px bg-ink-700" />}
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm text-center">{error}</div>}

        {/* Step 1: Plan Selection */}
        {step === 'plan' && (
          <div className="card-dark p-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Choose Your Plan</h2>
            <p className="text-ink-400 text-center mb-6">All prices include VAT. Cancel anytime.</p>

            {/* Account Type Toggle */}
            <div className="flex justify-center gap-4 mb-8">
              <button onClick={() => { setIsAgency(false); setSelectedPlan('PROFESSIONAL'); }} className={`flex items-center gap-2 px-6 py-3 rounded-xl transition ${!isAgency ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-ink-800 text-ink-400'}`}>
                <User className="w-5 h-5" /> Individual Agent
              </button>
              <button onClick={() => { setIsAgency(true); setSelectedPlan('AGENCY'); }} className={`flex items-center gap-2 px-6 py-3 rounded-xl transition ${isAgency ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-ink-800 text-ink-400'}`}>
                <Building2 className="w-5 h-5" /> Agency
              </button>
            </div>

            {/* Billing Cycle */}
            <div className="flex justify-center gap-3 mb-8">
              <button onClick={() => setCycle('MONTHLY')} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${cycle === 'MONTHLY' ? 'bg-white shadow text-purple-700' : 'text-ink-400 bg-ink-800'}`}>Monthly</button>
              <button onClick={() => setCycle('ANNUAL')} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${cycle === 'ANNUAL' ? 'bg-white shadow text-purple-700' : 'text-ink-400 bg-ink-800'}`}>Annual <span className="text-green-500 text-xs">Save 15%</span></button>
            </div>

            {/* Plans Grid */}
            <div className={`grid gap-4 ${isAgency ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-3'}`}>
              {(isAgency ? PLANS.filter(p => p.id === 'AGENCY') : PLANS.filter(p => p.id !== 'AGENCY')).map(p => (
                <button key={p.id} onClick={() => setSelectedPlan(p.id)} className={`relative p-6 rounded-xl text-left transition ${selectedPlan === p.id ? 'bg-purple-700/20 border-2 border-purple-500/50' : 'bg-ink-800/50 border border-white/5 hover:border-purple-500/20'}`}>
                  {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Most Popular</div>}
                  <h3 className="font-bold text-lg text-white">{p.name}</h3>
                  <p className="text-xs text-ink-400 mt-1">{p.tagline}</p>
                  <div className="mt-3">
                    <span className="text-3xl font-black text-white">{formatZar(cycle === 'ANNUAL' ? p.annualZar : p.monthlyZar)}</span>
                    <span className="text-ink-400 text-sm">/month</span>
                  </div>
                  <p className="text-sm text-purple-400 font-semibold mt-2">{p.monthlyCredits} credits/month</p>
                  <ul className="mt-4 space-y-2">
                    {p.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-ink-300"><Check className="w-3 h-3 text-purple-400" /> {f}</li>
                    ))}
                  </ul>
                  {isAgency && (
                    <div className="mt-4 p-2 bg-yellow-950/30 border border-yellow-500/20 rounded-lg">
                      <p className="text-xs text-yellow-300">⚠️ Limited to 10 agents per agency. Create additional agencies for more.</p>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-8 text-center">
              <button onClick={handleNext} className="btn btn-primary text-lg px-8 py-3">
                Continue <ArrowRight className="w-5 h-5" />
              </button>
              <p className="mt-4 text-sm text-ink-400">
                Already have an account? <Link to="/login" className="text-purple-400 hover:text-purple-300">Sign in</Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && (
          <div className="card-dark p-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              {isAgency ? 'Agency Details' : 'Your Details'}
            </h2>
            <p className="text-ink-400 text-center mb-6">
              {isAgency ? 'Register your agency and become the admin.' : 'Create your account to get started.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="label">Full Name *</label><input className="input" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="John Smith" required /></div>
                <div><label className="label">Email *</label><input type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="you@example.com" required /></div>
                <div><label className="label">Password *</label><input type="password" className="input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Min. 8 characters" required minLength={8} /></div>
                <div><label className="label">Phone</label><input className="input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+27..." /></div>
              </div>

              {isAgency && (
                <div className="border-t border-white/5 pt-4 mt-4">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-purple-400" /> Company Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="label">Company Name *</label><input className="input" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} placeholder="Demo Realty SA" required /></div>
                    <div><label className="label">Registration Number</label><input className="input" value={formData.companyReg} onChange={e => setFormData({...formData, companyReg: e.target.value})} placeholder="2025/123456/07" /></div>
                    <div><label className="label">VAT Number</label><input className="input" value={formData.companyVat} onChange={e => setFormData({...formData, companyVat: e.target.value})} placeholder="4123456789" /></div>
                    <div><label className="label">Physical Address</label><input className="input" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} placeholder="123 Main Rd, Cape Town" /></div>
                  </div>
                  <div className="mt-4 p-3 bg-purple-950/30 border border-purple-500/20 rounded-lg">
                    <p className="text-xs text-purple-300">📋 As agency admin, you'll be able to invite up to 10 agents, manage the shared credit pool, and monitor team usage.</p>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={formData.agreed} onChange={e => setFormData({...formData, agreed: e.target.checked})} className="mt-1 w-4 h-4 rounded" />
                <span className="text-xs text-ink-400">I understand that PropReel uses AI technology, which may produce imperfect results, and I agree that spent credits are non-refundable.</span>
              </label>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('plan')} className="btn btn-secondary"><ArrowLeft className="w-4 h-4" /> Back</button>
                <button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? 'Creating account...' : 'Continue to Payment'}</button>
              </div>
            </form>

            <div className="mt-4 text-center">
              <button onClick={loginWithGoogle} className="btn btn-secondary w-full">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Sign up with Google
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
