import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Trash2, XCircle, Check, Clock, CreditCard, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar } from '../lib/utils';

export default function CancelSubscriptionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleCancel = () => {
    // In production, this would call your backend API
    toast.success('Subscription cancelled successfully. You will retain access until the end of your billing period.', 'Subscription Cancelled');
    setTimeout(() => navigate('/dashboard/billing'), 2000);
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/dashboard/billing" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Billing
        </Link>

        {!showConfirm ? (
          <div className="card-dark p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-yellow-950/50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Cancel Subscription</h1>
                <p className="text-ink-400">We're sorry to see you go. Please let us know why you're cancelling.</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="label">Reason for Cancellation</label>
                <select
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Select a reason...</option>
                  <option value="too-expensive">Too expensive</option>
                  <option value="not-using">Not using it enough</option>
                  <option value="missing-features">Missing features I need</option>
                  <option value="switching">Switching to another service</option>
                  <option value="technical-issues">Technical issues</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="label">Additional Feedback (Optional)</label>
                <textarea
                  className="input min-h-[100px]"
                  placeholder="Tell us more about your experience..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-3">What happens when you cancel:</h3>
              <ul className="space-y-2 text-sm text-ink-300">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>You'll retain access until the end of your current billing period</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Unused subscription credits will expire at the end of the billing period</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Purchased credits (top-ups) never expire and remain in your account</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Your projects and videos remain accessible</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span>No refunds are issued for the current billing period</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Link to="/dashboard/billing" className="btn btn-secondary flex-1">
                Keep Subscription
              </Link>
              <button
                onClick={() => setShowConfirm(true)}
                className="btn btn-danger flex-1"
              >
                Continue to Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="card-dark p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-950/50 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Confirm Cancellation</h1>
                <p className="text-ink-400">Are you sure you want to cancel your subscription?</p>
              </div>
            </div>

            <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-red-300 mb-3">Important:</h3>
              <ul className="space-y-2 text-sm text-red-200">
                <li>• Your subscription will remain active until the end of your current billing period</li>
                <li>• You will not be charged again after this period</li>
                <li>• Unused subscription credits will expire at the end of the billing period</li>
                <li>• You can reactivate your subscription at any time</li>
              </ul>
            </div>

            <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-3">Your Current Subscription:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-400">Plan</span>
                  <span className="text-white font-medium">{user?.subscription?.planId || 'Professional'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Billing Cycle</span>
                  <span className="text-white font-medium">{user?.subscription?.cycle || 'Monthly'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Next Billing Date</span>
                  <span className="text-white font-medium">{user?.subscription?.currentPeriodEnd || '1 Apr 2025'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Amount</span>
                  <span className="text-white font-medium">{formatZar(user?.subscription?.nextChargeAmount || 589)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="btn btn-secondary flex-1"
              >
                Go Back
              </button>
              <button
                onClick={handleCancel}
                className="btn btn-danger flex-1"
              >
                <XCircle className="w-4 h-4" /> Confirm Cancellation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
