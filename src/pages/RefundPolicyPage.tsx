import { Link } from 'react-router-dom';
import { Shield, Check, AlertTriangle, Clock, CreditCard, ArrowLeft } from 'lucide-react';
import { AI_DISCLAIMER_TEXT } from '../lib/aiDisclaimer';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-4xl font-black text-white mb-4">Credit & Cancellation Policy</h1>
        <p className="text-lg text-ink-400 mb-6">Last updated: October 2026</p>

        {/* Quoted verbatim from lib/aiDisclaimer so the policy and the
            in-app acknowledgement gate can never drift apart. */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 mb-10" role="note">
          <p className="text-amber-200 font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> AI-generated content notice</p>
          <p className="text-amber-200 text-sm leading-relaxed">{AI_DISCLAIMER_TEXT}</p>
        </div>

        <div className="space-y-12">
          {/* Non-Refundable Credits */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Credits Are Non-Refundable</h2>
                <p className="text-ink-400 leading-relaxed mb-4">
                  All credits are <strong>non-refundable once spent</strong>. This includes:
                </p>
                <ul className="space-y-2 text-ink-400">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Credits used for video generation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Credits used for AI photo editing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Credits used for virtual staging</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Credits used for any other AI features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Credits spent on AI-generated results you consider unsatisfactory — AI can make mistakes, and results you are unhappy with are not refundable</span>
                  </li>
                </ul>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-4">
                  <p className="text-sm text-purple-200">
                    <strong>Important:</strong> By purchasing credits or subscribing to a plan, you acknowledge that all credits are non-refundable once used. 
                    Please ensure you are satisfied with our free trial before making a purchase.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Subscription Cancellations */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-yellow-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Subscription Cancellations</h2>
                <p className="text-ink-400 leading-relaxed mb-4">
                  When you cancel your subscription, you retain access to your remaining credits until the end of your current billing period. 
                  <strong> No refunds are issued for the current period.</strong>
                </p>
                <ul className="space-y-2 text-ink-400">
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-300 mt-1">•</span>
                    <span>Monthly plans: Access continues until the end of the current month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-300 mt-1">•</span>
                    <span>Annual plans: Access continues until the end of the current year</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-300 mt-1">•</span>
                    <span>Credits already in your account stay usable until their expiry date — 365 days after they were added</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Purchased Credits */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-blue-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Purchased Credits (Top-ups)</h2>
                <p className="text-ink-400 leading-relaxed mb-4">
                  Credits purchased as top-ups are <strong>non-refundable</strong> and <strong>expire 365 days after purchase</strong>.
                  They are not removed when you cancel a subscription.
                </p>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Note:</strong> A failed render is refunded automatically. Credits are only lost at their expiry date.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Downgrades */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Plan Downgrades</h2>
                <p className="text-ink-400 leading-relaxed mb-4">
                  If you downgrade your plan (e.g., from Premium to Starter), the change takes effect at your <strong>next renewal date</strong>, 
                  not immediately. You keep your current plan's credits until then.
                </p>
                <ul className="space-y-2 text-ink-400">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>No refund for the price difference</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>Current cycle credits are preserved</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-300 mt-1">•</span>
                    <span>New (lower) credit allowance starts at next renewal</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Upgrades */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                <Check className="w-6 h-6 text-green-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Plan Upgrades (Prorated)</h2>
                <p className="text-ink-400 leading-relaxed mb-4">
                  If you upgrade your plan mid-month (e.g., from Starter to Professional), you'll be charged a <strong>prorated amount</strong> for the remainder of the billing cycle.
                </p>
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                  <p className="text-sm text-green-200">
                    <strong>Example:</strong> Upgrading from Starter (R129/mo) to Professional (R589/mo) halfway through the month = 
                    you pay the difference (R460) prorated for the remaining 15 days.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Credit Expiry */}
          <section>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-ink-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Credit Expiry Policy</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-white mb-1">Subscription Credits</h3>
                    <p className="text-ink-400 text-sm">
                      Plan credits roll over month to month while your plan is active — they are not reset when your plan renews. Each credit expires 365 days after it is added.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Purchased Credits (Top-ups)</h3>
                    <p className="text-ink-400 text-sm">
                      Expire 365 days after purchase. Cancelling a subscription does not remove them.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Gifted Credits</h3>
                    <p className="text-ink-400 text-sm">
                      Same 365-day rule from the day they are received.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="border-t border-white/10 pt-8">
            <h2 className="text-2xl font-bold text-white mb-4">Questions?</h2>
            <p className="text-ink-400 mb-4">
              If you have questions about our refund policy or need assistance, please contact our support team.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="mailto:support@propreel.co.za" className="btn btn-primary">
                Email Support
              </a>
              <Link to="/contact" className="btn glass text-white hover:bg-white/10">
                Contact Form
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
