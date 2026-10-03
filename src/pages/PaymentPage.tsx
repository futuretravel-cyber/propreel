import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar } from '../lib/utils';
import { PLANS } from '../lib/constants';
import { BackendAPI } from '../lib/backendAPI';
import { CreditCard, Check, Shield, Lock, Loader2, LogIn } from 'lucide-react';

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading, refresh } = useCredit();
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const planId = searchParams.get('plan') || 'PROFESSIONAL';
  const cycle = searchParams.get('cycle') || 'MONTHLY';
  const priceParam = Number(searchParams.get('price')) || 0;
  const isTopup = searchParams.get('topup') === 'true';
  const topupAmount = Number(searchParams.get('amount')) || 0;

  // Paystack hosted-checkout redirect lands here as
  // /payment/callback?trxref=<ref>&reference=<ref>. Verify server-side so the
  // balance (and invoice/plan state) is applied even if the webhook is slow,
  // and so the page shows the right confirmation instead of a fresh checkout.
  const callbackRef = searchParams.get('trxref') || searchParams.get('reference');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const verifiedRef = useRef(false);

  const plan = PLANS.find(p => p.id === planId);
  const amount = isTopup ? topupAmount : priceParam;
  const signedIn = !loading && !!user;
  const loginPath = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  const runVerify = async (reference: string) => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/paystack/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Payment not verified');
      setCreditsAdded(typeof data.credits_added === 'number' ? data.credits_added : 0);
      if (typeof data.new_balance === 'number') setNewBalance(data.new_balance);
      setSuccess(true);
      await refresh();
    } catch (err: any) {
      setVerifyError(err.message || 'Could not verify this payment yet');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!callbackRef || verifiedRef.current) return;
    verifiedRef.current = true;
    runVerify(callbackRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackRef]);

  // Payment approved → straight to the dashboard, where the welcome message
  // and the dashboard tutorial are waiting.
  useEffect(() => {
    if (!success || !signedIn) return;
    const t = setTimeout(() => navigate('/dashboard?welcome=1', { replace: true }), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, signedIn]);

  // Real payment flow:
  //  - Credit top-ups → Paystack hosted checkout (initialize → redirect).
  //    Credits are credited server-side by /api/paystack/verify + webhook
  //    after the customer pays.
  //  - Plan subscriptions → /api/subscriptions?action=create (creates the
  //    subscription, Paystack customer/plan, and allocates plan credits).
  const handlePaystack = async () => {
    setProcessing(true);
    try {
      if (!user) {
        // Never strand the visitor on an error toast — send them to sign in
        // and back to this exact payment page afterwards.
        navigate(loginPath);
        return;
      }

      if (isTopup) {
        const response = await BackendAPI.initializePayment(user.id, topupAmount, user.email);
        // Redirect to Paystack's hosted checkout page (real payment)
        window.location.href = response.authorization_url;
        return; // page navigates away
      }

      const response = await BackendAPI.createSubscription(user.id, planId, cycle as 'MONTHLY' | 'ANNUAL');
      if (!response.success) throw new Error(response.message || 'Subscription could not be created');
      await refresh();
      setSuccess(true);
      toast.success(`${plan?.name || planId} subscription activated — ${response.credits_allocated} credits loaded.`, 'Payment Complete');
    } catch (err: any) {
      toast.error(err.message || 'Payment failed');
      setProcessing(false);
    }
  };

  if (success) {
    const balance = newBalance ?? user?.credits ?? 0;
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-ink-400 mb-4">
            {callbackRef || isTopup
              ? creditsAdded
                ? `${creditsAdded} credits added — your balance is now ${balance}.`
                : 'Your credits are already in your account.'
              : `Your ${plan?.name} subscription is now active with ${balance} credits available.`
            }
          </p>
          <div className="bg-ink-800/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-ink-400">Amount</p>
            <p className="text-2xl font-bold text-white">{formatZar(amount)}</p>
          </div>
          <Link to="/dashboard?welcome=1" className="btn btn-primary mt-4 w-full">Go to Dashboard</Link>
          <p className="text-xs text-ink-500 mt-3">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  // Callback URL while the verify call is still running
  if (callbackRef && verifying) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center">
          <Loader2 className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Confirming your payment…</h2>
          <p className="text-ink-400 text-sm">Reference {callbackRef} — this only takes a moment.</p>
        </div>
      </div>
    );
  }

  // Callback URL that could not be verified yet — honest state, not a fresh
  // checkout form for an amount we don't know.
  if (callbackRef && verifyError) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-2">Payment received — confirming…</h2>
          <p className="text-ink-400 text-sm mb-6">{verifyError}. Your payment is safe; we just couldn't confirm it yet.</p>
          <button onClick={() => runVerify(callbackRef)} className="btn btn-primary w-full">
            Check again
          </button>
          <Link to="/dashboard" className="btn w-full mt-3">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Signed-out visitor on the payment page (e.g. the confirmation-email link
  // after clearing cookies, or a shared plan link) → sign in and come back.
  if (!loading && !user && !callbackRef) {
    const nextParam = searchParams.get('next');
    const backTo = nextParam || (location.pathname + location.search);
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-7 h-7 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sign in to continue</h2>
          <p className="text-ink-400 text-sm mb-6">
            {plan && !isTopup
              ? `Sign in (or create an account) to subscribe to the ${plan.name} plan — you'll come straight back to this page.`
              : 'Sign in (or create an account) to complete this payment — you’ll come straight back to this page.'}
          </p>
          <Link
            to={`/login?next=${encodeURIComponent(backTo)}`}
            className="btn btn-primary w-full text-lg py-3"
          >
            Sign In
          </Link>
          <Link
            to={`/register?plan=${planId}&cycle=${cycle}&price=${priceParam}`}
            className="btn w-full mt-3"
          >
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>

        <div className="card-dark p-8">
          <h2 className="text-2xl font-bold text-white text-center mb-2">
            {isTopup ? 'Top Up Credits' : 'Complete Your Subscription'}
          </h2>
          <p className="text-ink-400 text-center mb-6">
            {isTopup ? `Add ${topupAmount} credits to your account` : `Subscribe to ${plan?.name}`}
          </p>

          {/* Order Summary */}
          <div className="bg-ink-800/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-ink-400 text-sm">{isTopup ? 'Credit Top-up' : plan?.name + ' Plan'}</span>
              <span className="text-white font-medium">{isTopup ? `${topupAmount} credits` : `${plan?.monthlyCredits} credits/month`}</span>
            </div>
            {!isTopup && (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-ink-400 text-sm">Billing Cycle</span>
                <span className="text-white font-medium">{cycle === 'ANNUAL' ? 'Annual' : 'Monthly'}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-white font-semibold">Total</span>
              <span className="text-2xl font-bold text-purple-400">{formatZar(amount)}</span>
            </div>
            <p className="text-xs text-ink-500 mt-2">All prices include VAT</p>
          </div>

          {/* Payment Button */}
          <button
            onClick={handlePaystack}
            disabled={processing || loading}
            className="btn btn-primary w-full text-lg py-4 mb-4"
          >
            {processing ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
            ) : (
              <><CreditCard className="w-5 h-5" /> Pay with Paystack</>
            )}
          </button>

          {/* Security Badges */}
          <div className="flex items-center justify-center gap-4 text-xs text-ink-500">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Secure Payment</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> PCI Compliant</span>
          </div>

          {/* Refund Policy */}
          <div className="mt-6 p-3 bg-ink-800/30 rounded-lg">
            <p className="text-xs text-ink-400 text-center">
              <strong className="text-ink-300">Credit Policy:</strong> All credits are non-refundable once spent. 
              Subscription cancellations apply at next renewal. Purchased credits never expire (365 days of inactivity).
            </p>
          </div>

          {!isTopup && (
            <div className="mt-4 text-center">
              <p className="text-xs text-ink-500">
                By subscribing, you agree to our <Link to="/refund-policy" className="text-purple-400 hover:text-purple-300">Terms & Refund Policy</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
