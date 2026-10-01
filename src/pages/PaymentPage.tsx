import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar } from '../lib/utils';
import { PLANS } from '../lib/constants';
import { BackendAPI } from '../lib/backendAPI';
import { CreditCard, Check, Shield, Lock } from 'lucide-react';

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user, refresh } = useCredit();
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const planId = searchParams.get('plan') || 'PROFESSIONAL';
  const cycle = searchParams.get('cycle') || 'MONTHLY';
  const priceParam = Number(searchParams.get('price')) || 0;
  const isTopup = searchParams.get('topup') === 'true';
  const topupAmount = Number(searchParams.get('amount')) || 0;

  const plan = PLANS.find(p => p.id === planId);
  const amount = isTopup ? topupAmount : priceParam;

  // Real payment flow:
  //  - Credit top-ups → Paystack hosted checkout (initialize → redirect).
  //    Credits are credited server-side by /api/paystack/verify + webhook
  //    after the customer pays.
  //  - Plan subscriptions → /api/subscriptions?action=create (creates the
  //    subscription, Paystack customer/plan, and allocates plan credits).
  const handlePaystack = async () => {
    setProcessing(true);
    try {
      if (!user) throw new Error('Please sign in to continue with payment');

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
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <div className="card-dark p-8 max-w-md text-center animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-ink-400 mb-4">
            {isTopup
              ? `${topupAmount} credits are being added to your account — refresh your dashboard in a moment.`
              : `Your ${plan?.name} subscription is now active with ${user?.credits ?? 0} credits available.`
            }
          </p>
          <div className="bg-ink-800/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-ink-400">Amount</p>
            <p className="text-2xl font-bold text-white">{formatZar(amount)}</p>
          </div>
          <Link to="/dashboard" className="btn btn-primary mt-4 w-full">Go to Dashboard</Link>
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
            disabled={processing}
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
