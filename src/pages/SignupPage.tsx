import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { track } from '../lib/analytics';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PLANS, SIGNUP_BONUS, PHONE_COUNTRY_CODES } from '../lib/constants';
import { formatZar, creditListZar } from '../lib/utils';
import { Check, ArrowRight, ArrowLeft, Sparkles, Building2, User, CreditCard, Shield, Mail, RefreshCw, AlertTriangle } from 'lucide-react';

type Step = 'plan' | 'details' | 'payment' | 'confirm';

// Shape of GET /api/users?action=signup_invite&email=… — what the invited
// signup banner shows about the agency they're joining.
interface AgencyInviteInfo {
  agencyId: string;
  agencyName: string | null;
  inviterName: string | null;
  role: string;
}

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  // ── Agency-invite deep link (?invite=<email>) ────────────────────────
  // An agent invited by an agency needs NO subscription: credits come from
  // the agency pool, so the whole plan → payment flow is skipped. This
  // branch shows only name / email / password (plus the pre-filled locked
  // email), and the backend attaches them to the agency at registration.
  const inviteEmailParam = (searchParams.get('invite') || '').trim().toLowerCase();
  const invited = !!inviteEmailParam;
  const [inviteInfo, setInviteInfo] = useState<AgencyInviteInfo | null>(null);
  const [inviteLoadError, setInviteLoadError] = useState('');
  useEffect(() => {
    if (!inviteEmailParam) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=auth_signup_invite&email=${encodeURIComponent(inviteEmailParam)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'This invitation could not be found');
        setInviteInfo(data);
      } catch (e: any) {
        if (!cancelled) setInviteLoadError(e.message || 'This invitation could not be found');
      }
    })();
    return () => { cancelled = true; };
  }, [inviteEmailParam]);
  const [step, setStep] = useState<Step>(invited ? 'details' : 'plan');
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
  // FREE-ACCOUNT DEFAULT (2026-10-21): registration completes with NO
  // subscription and NO trial clock — a permanent free account (the 5-credit
  // signup bonus is its fuel). The opt-in on the details step is the only
  // path to plan checkout, and ?plan= deep-links (pricing CTAs) pre-check it.
  // Nothing here starts a new trial clock; the lib/trial.ts machinery still
  // runs for rows that already carry one.
  const [subscribeNow, setSubscribeNow] = useState(() => !!searchParams.get('plan'));
  const [dial, setDial] = useState('+27');
  const [formData, setFormData] = useState({
    fullName: '', email: inviteEmailParam, password: '', phone: '',
    agencyName: '', companyName: '', companyReg: '', companyVat: '', companyAddress: '',
    agreed: false,
    twoStep: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // Registration created/reused the (still-unconfirmed) account but the
  // confirmation email failed — the confirm step shows resend/sign-in
  // options instead of leaving the user to resubmit into the same failure.
  const [emailFailed, setEmailFailed] = useState('');
  // 409 — this email belongs to an already-confirmed account: sign in (or
  // reset the password) rather than retrying registration.
  const [existingAccount, setExistingAccount] = useState(false);
  const { register, user } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();

  const plan = PLANS.find(p => p.id === selectedPlan)!;
  const price = cycle === 'ANNUAL' ? plan.annualZar : plan.monthlyZar;

  // Google OAuth signup returns to this page signed-in — complete the
  // stored post-auth redirect (plan checkout for the selected plan).
  // A deep-linked plan (?plan=…) always goes to its payment page, never
  // silently back to the dashboard (the Billing → "Choose a Plan" dead end).
  useEffect(() => {
    if (!user) return;
    if (searchParams.get('plan')) {
      navigate(`/payment?plan=${selectedPlan}&cycle=${cycle}&price=${price}`, { replace: true });
      return;
    }
    import('../lib/postAuth').then(({ takePostAuthRedirect }) => {
      navigate(takePostAuthRedirect(), { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

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

  const paymentUrl = `/payment?plan=${selectedPlan}&cycle=${cycle}&price=${price}`;
  // Free accounts (the default) skip checkout entirely — post-auth lands on
  // the dashboard and they can subscribe later from Billing. Agency accounts
  // always pay (the Agency plan funds the shared pool); agency-invited agents
  // never see a payment page — the confirmation link goes straight to their
  // (agency-linked) dashboard.
  const subscribeSelected = !invited && (isAgency || subscribeNow);
  const postAuthUrl = subscribeSelected ? paymentUrl : '/dashboard';
  // Combine the selected dial code with the number; if the user typed an
  // international number (+…) themselves, strip that prefix so it isn't
  // double-dialled.
  const national = formData.phone.trim().replace(/^\+\d{1,4}\s*/, '');
  const fullPhone = national ? `${dial} ${national}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreed) { setError('You must acknowledge the AI disclaimer'); return; }
    setLoading(true);
    setError('');
    setExistingAccount(false);
    setEmailFailed('');
    try {
      // Where the confirmation-email link should land: the selected plan's
      // payment page for a subscribing signup, or the dashboard for a free
      // account. (Agency-invited agents always land on the dashboard.)
      const emailRedirectTo = `${window.location.origin}${postAuthUrl}`;
      import('../lib/postAuth').then(m => m.setPostAuthRedirect(postAuthUrl));
      const result = await register({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phone: fullPhone,
        emailRedirectTo,
        agencyName: isAgency ? formData.companyName : formData.agencyName,
        planId: invited ? 'STARTER' : subscribeSelected ? (selectedPlan as any) : 'FREE',
        cycle,
        aiAcknowledged: formData.agreed,
        companyName: formData.companyName,
        companyReg: formData.companyReg,
        companyVat: formData.companyVat,
        companyAddress: formData.companyAddress,
        referralCode: referralCode || undefined,
        enableTwoFactor: formData.twoStep,
        // startTrial deliberately omitted: no NEW signup starts a 7-day
        // temporary-account clock — free is permanent (2026-10-21).
      });
      track('signup_completed', invited ? { plan: 'agency_invite' } : { plan: selectedPlan, cycle, mode: subscribeSelected ? 'plan' : 'free' });
      if (result.needsConfirmation) {
        // Email confirmation required (mailer_autoconfirm=false): there is no
        // session yet, so we can't go to the payment page — show the
        // "check your inbox" step instead and let the email link finish it.
        setStep('confirm');
        toast.success(`We sent a confirmation link to ${formData.email}`, 'Confirm your email');
      } else {
        toast.success(`Welcome! You've received ${SIGNUP_BONUS} free credits!`, 'Account Created');
        navigate(postAuthUrl);
      }
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      if (err.needsConfirmation || /confirmation email could not be sent/i.test(msg)) {
        // The account exists but is unconfirmed — resubmitting would just
        // try to send the same email again. Offer resend / sign-in instead.
        setEmailFailed(msg);
        setStep('confirm');
      } else if (err.status === 409) {
        // Already-confirmed account: continue by signing in, not retrying.
        setExistingAccount(true);
        setError(msg);
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  const resendConfirmation = async () => {
    setResending(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=auth_resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          redirect: `${window.location.origin}${postAuthUrl}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resend the email');
      // Worked — leave the failed state; the standard inbox instructions apply.
      setEmailFailed('');
      setError('');
      toast.success(`Confirmation link re-sent to ${formData.email}`, 'Email sent');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend the email');
    }
    setResending(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>

        {/* Progress Steps — hidden in invite mode (no plan/payment steps) */}
        {step !== 'confirm' && !invited && !inviteLoadError && (
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
        )}

        {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm text-center">{error}</div>}

        {/* Already-confirmed account (409): give the way forward inline instead
            of a retry that can only fail again. */}
        {existingAccount && step === 'details' && (
          <div className="mb-4 p-4 rounded-lg bg-ink-800/70 border border-white/10 space-y-2 text-center">
            <button type="button" onClick={() => navigate('/login')} className="btn btn-primary w-full">
              Sign in to your account
            </button>
            <Link to="/forgot-password" className="text-sm text-purple-400 hover:text-purple-300">
              No password yet? Set one via “Forgot password”
            </Link>
          </div>
        )}

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
                  <p className="text-sm text-purple-400 font-semibold mt-2">{p.monthlyCredits} credits/month ≈ {creditListZar(p.monthlyCredits)}</p>
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
                No card needed to start — you'll create a free account unless you choose to subscribe.
              </p>

              {/* Zero-risk entry — skip plan selection entirely and register
                  as a permanent free account (subscribeNow stays false). */}
              <div className="mt-4 max-w-xl mx-auto p-4 rounded-xl bg-purple-950/30 border border-purple-500/20 text-center">
                <p className="text-sm text-ink-300">
                  <span className="font-semibold text-white">Just exploring?</span>{' '}
                  <button
                    type="button"
                    onClick={() => { setIsAgency(false); setSelectedPlan('PROFESSIONAL'); setSubscribeNow(false); setError(''); setStep('details'); }}
                    className="text-purple-400 hover:text-purple-300 font-medium underline"
                  >
                    Create a free account
                  </button>{' '}                   — {SIGNUP_BONUS} free credits, no card needed. Spend them on a real listing before you decide.
                </p>
              </div>

              <p className="mt-2 text-sm text-ink-400">
                Already have an account? <Link to="/login" className="text-purple-400 hover:text-purple-300">Sign in</Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && (
          <div className="card-dark p-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              {invited ? 'Join Your Agency' : isAgency ? 'Agency Details' : 'Your Details'}
            </h2>
            <p className="text-ink-400 text-center mb-6">
              {invited
                ? `Set up your account to join ${inviteInfo?.agencyName || 'your agency'} — credits are provided by the agency.`
                : isAgency ? 'Register your agency and become the admin.' : 'Create your account to get started.'}
            </p>

            {/* Invited-agent banner: which agency, who invited, what happens */}
            {invited && inviteLoadError && (
              <div className="mb-4 p-4 rounded-lg bg-amber-950/40 border border-amber-500/30">
                <p className="text-xs text-amber-300 mb-2">{inviteLoadError}</p>
                <p className="text-xs text-ink-400">
                  If your agency already invited you, use the signup link exactly as it was sent. Otherwise you can <Link to="/signup" className="text-purple-400 hover:text-purple-300">sign up normally</Link>.
                </p>
              </div>
            )}
            {invited && inviteInfo && (
              <div className="mb-4 p-4 rounded-lg bg-purple-950/30 border border-purple-500/20">
                <p className="text-sm text-white font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-purple-400" /> {inviteInfo.agencyName || 'An agency'}</p>
                <ul className="mt-2 space-y-1 text-xs text-ink-300">
                  <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-400" /> No subscription needed — the agency pays</li>
                  <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-400" /> Credits come from your agency's shared pool</li>
                  {inviteInfo.inviterName && <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-400" /> Invited by {inviteInfo.inviterName}</li>}
                </ul>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="label">Full Name *</label><input className="input" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="John Smith" required /></div>
                <div>
                  <label className="label">Email *</label>
                  {/* Invite mode: the email IS the invite — locked in place so
                      the signup can only ever attach the invited agency. */}
                  <input type="email" className="input" value={formData.email} onChange={invited ? undefined : e => setFormData({...formData, email: e.target.value})} placeholder="you@example.com" required readOnly={invited} disabled={invited} />
                  {invited && <p className="text-xs text-ink-500 mt-1">Your invite email — sign in with this address</p>}
                </div>
                <div><label className="label">Password *</label><input type="password" className="input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Min. 8 characters" required minLength={8} /></div>
                <div>
                  <label className="label">Phone</label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Country dialing code"
                      className="input w-32 shrink-0"
                      value={dial}
                      onChange={e => setDial(e.target.value)}
                    >
                      {PHONE_COUNTRY_CODES.map(c => (
                        <option key={`${c.code}-${c.dial}`} value={c.dial}>{c.dial} {c.code}</option>
                      ))}
                    </select>
                    <input
                      className="input flex-1 min-w-0"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="82 123 4567"
                      inputMode="tel"
                    />
                  </div>
                  <p className="text-xs text-ink-500 mt-1">Optional — includes your international dialing code</p>
                </div>
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

              {!isAgency && !invited && (
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-purple-950/30 border border-purple-500/20">
                  <input type="checkbox" checked={subscribeNow} onChange={e => setSubscribeNow(e.target.checked)} className="mt-1 w-4 h-4 rounded" />
                  <span className="text-xs text-ink-300">
                    <span className="text-white font-semibold">Subscribe to {plan.name} now — {formatZar(price)}{cycle === 'ANNUAL' ? ' per month, billed annually' : ' per month'}.</span>{' '}
                    You'll continue to secure Paystack checkout after creating your account. Leave this unchecked to create a free account — no card, {SIGNUP_BONUS} free credits, upgrade any time from Billing.
                  </span>
                </label>
              )}

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={formData.agreed} onChange={e => setFormData({...formData, agreed: e.target.checked})} className="mt-1 w-4 h-4 rounded" />
                <span className="text-xs text-ink-400">I understand that PropReel uses AI technology, which may produce imperfect results, and I agree that spent credits are non-refundable. I agree to the <Link to="/terms" className="text-purple-400 hover:text-purple-300 underline">Terms of Service</Link>.</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={formData.twoStep} onChange={e => setFormData({...formData, twoStep: e.target.checked})} className="mt-1 w-4 h-4 rounded" />
                <span className="text-xs text-ink-400">
                  <span className="text-white font-semibold">Protect my account with two-step verification.</span>{' '}
                  After confirming your email you'll scan a QR code with an authenticator app (Google Authenticator, Authy, …) and sign in with a 6-digit code.
                </span>
              </label>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('plan')} className="btn btn-secondary"><ArrowLeft className="w-4 h-4" /> Back</button>
                <button type="submit" disabled={loading || (invited && !!inviteLoadError)} className="btn btn-primary flex-1">{loading ? 'Creating account...' : invited ? 'Create account & join agency' : subscribeSelected ? 'Continue to Payment' : 'Create free account'}</button>
              </div>
            </form>

            <div className="mt-4 text-center">
              <p className="text-xs text-ink-500">Prefer to set up an account manually? <Link to="/login" className="text-purple-400 hover:text-purple-300">Sign in</Link></p>
            </div>
          </div>
        )}

        {/* Step 4: Confirm your email (mailer_autoconfirm=false) */}
        {step === 'confirm' && (
          <div className="card-dark p-8 text-center animate-fade-in max-w-lg mx-auto">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${emailFailed ? 'bg-amber-500/15' : 'bg-purple-500/20'}`}>
              {emailFailed ? <AlertTriangle className="w-8 h-8 text-amber-400" /> : <Mail className="w-8 h-8 text-purple-400" />}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {emailFailed ? 'Confirmation email not sent' : 'Check your inbox'}
            </h2>
            {emailFailed ? (
              <>
                <p className="text-ink-400 mb-3">
                  Your account for <span className="text-white font-semibold break-all">{formData.email}</span> exists, but the confirmation email didn’t go out:
                </p>
                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 mb-4 text-left">
                  <p className="text-xs text-amber-300">{emailFailed}</p>
                </div>
                <p className="text-sm text-ink-400 mb-4 text-left">
                  Your account and {SIGNUP_BONUS} free credits are safe — it just needs its address confirmed. Try resending below, or sign in if you’ve already confirmed it.
                </p>
              </>
            ) : (
              <>
                <p className="text-ink-400 mb-2">
                  We sent a confirmation link to
                </p>
                <p className="text-white font-semibold break-all mb-4">{formData.email}</p>
              </>
            )}
            <div className="bg-ink-800/50 rounded-xl p-4 mb-6 text-left">
              <ol className="space-y-2 text-sm text-ink-300 list-decimal list-inside">
                <li>Click the link in the email to confirm your address</li>
                {invited ? (
                  <>
                    <li>You'll land on your dashboard, already linked to {inviteInfo?.agencyName || 'your agency'}</li>
                    <li>Credits come from the agency's shared pool — no payment page, no trial</li>
                  </>
                ) : !subscribeSelected ? (
                  <>
                    <li>You'll land on your dashboard with {SIGNUP_BONUS} free credits</li>
                    <li>No card needed — subscribe any time from Billing, whenever you're ready</li>
                  </>
                ) : (
                  <>
                    <li>You'll land on the {plan.name} payment page, signed in</li>
                    <li>Pay with Paystack → straight to your dashboard, where a welcome message and a short tour are waiting</li>
                  </>
                )}
              </ol>
              <p className="text-xs text-ink-500 mt-3">
                Your {SIGNUP_BONUS} free credits are added the moment your account is created.
              </p>
            </div>
            <button onClick={resendConfirmation} disabled={resending} className={`w-full mb-3 ${emailFailed ? 'btn btn-primary' : 'btn btn-secondary'}`}>
              {resending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <>Resend confirmation email</>}
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setEmailFailed(''); setError(''); setStep('details'); }} className="btn btn-secondary flex-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <Link to="/login" className="btn flex-1 justify-center">Sign in</Link>
            </div>
            <p className="text-xs text-ink-500 mt-4">
              Wrong email? Go back and fix it. The link expires — request a new one if it does.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
