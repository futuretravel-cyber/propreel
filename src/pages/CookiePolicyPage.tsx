import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie, Shield, Settings, RefreshCw } from 'lucide-react';
import { clearConsent } from '../lib/consent';

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Cookie className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white">Cookie Policy</h1>
            <p className="text-sm text-ink-500 mt-1">Last updated: March 2025</p>
          </div>
        </div>

        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6 mb-8">
          <p className="text-purple-200 font-semibold mb-2">What Are Cookies?</p>
          <p className="text-purple-200 text-sm">
            Cookies are small text files stored on your device when you visit our website. They help us provide 
            you with a better experience by remembering your preferences and understanding how you use our Service.
          </p>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">1. How We Use Cookies</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              PropReel uses cookies and similar tracking technologies to:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>Keep you logged in and maintain your session</li>
              <li>Remember your preferences and settings</li>
              <li>Understand how you use our Service</li>
              <li>Improve our Service and user experience</li>
              <li>Process payments securely through Paystack</li>
              <li>Provide analytics and performance monitoring</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">2. Types of Cookies We Use</h2>
            
            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.1 Essential Cookies</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              These cookies are necessary for the Service to function properly. They cannot be disabled.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 font-semibold text-white">Cookie Name</th>
                    <th className="text-left py-2 font-semibold text-white">Purpose</th>
                    <th className="text-left py-2 font-semibold text-white">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-ink-300">
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">sb-[project-ref]-auth-token</td>
                    <td className="py-2">Authentication session</td>
                    <td className="py-2">Session</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">propreel_token</td>
                    <td className="py-2">User authentication</td>
                    <td className="py-2">7 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-xs">csrf-token</td>
                    <td className="py-2">Security protection</td>
                    <td className="py-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.2 Functional Cookies</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              These cookies enable enhanced functionality and personalization.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 font-semibold text-white">Cookie Name</th>
                    <th className="text-left py-2 font-semibold text-white">Purpose</th>
                    <th className="text-left py-2 font-semibold text-white">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-ink-300">
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">preferences</td>
                    <td className="py-2">User preferences (theme, language)</td>
                    <td className="py-2">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-xs">recent_searches</td>
                    <td className="py-2">Recent search history</td>
                    <td className="py-2">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.3 Analytics Cookies</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              These cookies help us understand how visitors interact with our Service.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 font-semibold text-white">Cookie Name</th>
                    <th className="text-left py-2 font-semibold text-white">Purpose</th>
                    <th className="text-left py-2 font-semibold text-white">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-ink-300">
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">_ga, _ga_*</td>
                    <td className="py-2">Google Analytics</td>
                    <td className="py-2">2 years</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">_gid</td>
                    <td className="py-2">Google Analytics</td>
                    <td className="py-2">24 hours</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-xs">session_id</td>
                    <td className="py-2">Session tracking</td>
                    <td className="py-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.4 Payment Cookies</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              These cookies are set by Paystack to process payments securely.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 font-semibold text-white">Cookie Name</th>
                    <th className="text-left py-2 font-semibold text-white">Purpose</th>
                    <th className="text-left py-2 font-semibold text-white">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-ink-300">
                  <tr className="border-b border-white/10">
                    <td className="py-2 font-mono text-xs">paystack_session</td>
                    <td className="py-2">Payment session</td>
                    <td className="py-2">Session</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-xs">paystack_checkout</td>
                    <td className="py-2">Checkout process</td>
                    <td className="py-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">3. Third-Party Cookies</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              Some cookies are placed by third-party services we use:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><strong>Paystack:</strong> Payment processing</li>
              <li><strong>Google:</strong> Analytics and authentication (if using Google login)</li>
              <li><strong>Cloudflare:</strong> Security and performance</li>
            </ul>
            <p className="text-ink-300 leading-relaxed">
              These third parties have their own privacy policies. We encourage you to review them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">4. Managing Cookies</h2>
            
            <h3 className="text-xl font-semibold text-white mt-6 mb-3">4.1 Browser Settings</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              You can control and delete cookies through your browser settings. Most browsers allow you to:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>View what cookies are stored and delete them individually</li>
              <li>Block third-party cookies</li>
              <li>Block all cookies</li>
              <li>Delete all cookies when you close your browser</li>
            </ul>
            <p className="text-ink-300 leading-relaxed mb-4">
              Here are links to cookie management instructions for popular browsers:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Chrome</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Firefox</a></li>
              <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Safari</a></li>
              <li><a href="https://support.microsoft.com/en-us/microsoft-edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Edge</a></li>
            </ul>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">4.2 Opt-Out Tools</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              You can also use these opt-out tools:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2">
              <li><a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Google Analytics Opt-out</a></li>
              <li><a href="https://www.youronlinechoices.com/" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">Your Online Choices (EU)</a></li>
              <li><a href="https://optout.aboutads.info/" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">About Ads (US)</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">5. Impact of Disabling Cookies</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              If you disable cookies, please note:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><strong>Essential cookies:</strong> The Service will not function properly. You will not be able to log in or use most features.</li>
              <li><strong>Functional cookies:</strong> Your preferences will not be remembered. You may need to set them each time you visit.</li>
              <li><strong>Analytics cookies:</strong> Disabling these has no impact on your experience but helps us improve the Service.</li>
              <li><strong>Payment cookies:</strong> You will not be able to complete purchases.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">6. Consent</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              When you first visit our website, we display a cookie banner asking for your consent to use
              non-essential cookies. You can:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><strong>Accept all:</strong> Essential cookies plus privacy-friendly analytics</li>
              <li><strong>Essential only:</strong> Strictly necessary cookies — the service works exactly the same</li>
            </ul>
            <p className="text-ink-300 leading-relaxed mb-4">
              Your choice is remembered on this device, and analytics is never loaded without an explicit
              “Accept all”. You can also change cookies at any time through your browser settings.
            </p>
            <button
              onClick={() => clearConsent()}
              className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" /> Change cookie preferences
            </button>
            <p className="text-xs text-ink-500 mt-2">
              Clears your choice — the consent banner reappears so you can pick again.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">7. Updates to This Policy</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              We may update this Cookie Policy from time to time to reflect changes in technology, legislation, 
              or our data practices. When we make material changes, we will notify you through the Service or 
              by email.
            </p>
            <p className="text-ink-300 leading-relaxed">
              We encourage you to review this policy periodically to stay informed about our use of cookies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">8. Contact Us</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              If you have questions about our use of cookies or this Cookie Policy:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-3">
                <Cookie className="w-5 h-5 text-purple-300 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Email</p>
                  <p className="text-ink-300">privacy@propreel.co.za</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-300 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Information Officer</p>
                  <p className="text-ink-300">information.officer@propreel.co.za</p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8 mt-12">
            <p className="text-sm text-ink-500 text-center">
              © 2025 PropReel. All rights reserved. This Cookie Policy is effective as of March 2025.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
