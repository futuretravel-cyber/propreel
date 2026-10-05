import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Database, Users, Mail } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Lock className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-gray-900">Privacy Policy</h1>
            <p className="text-sm text-gray-500 mt-1">POPIA Compliant • Last updated: March 2025</p>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8">
          <p className="text-purple-900 font-semibold mb-2">POPIA Compliance Notice</p>
          <p className="text-purple-800 text-sm">
            This Privacy Policy complies with the Protection of Personal Information Act (POPIA) of South Africa. 
            We are committed to protecting your personal information and your right to privacy.
          </p>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel ("we," "us," or "our") respects your privacy and is committed to protecting your personal 
              information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
              when you use our service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Please read this Privacy Policy carefully. By using our Service, you agree to the collection and use 
              of information in accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.1 Personal Information</h3>
            <p className="text-gray-700 leading-relaxed mb-4">We collect information you provide directly:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Account Information:</strong> Name, email address, phone number, password</li>
              <li><strong>Agency Information:</strong> Company name, registration number, VAT number, address</li>
              <li><strong>Payment Information:</strong> Billing details (processed securely through Paystack)</li>
              <li><strong>Property Information:</strong> Property addresses, photos, descriptions you upload</li>
              <li><strong>Communications:</strong> Messages you send to us or through our platform</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.2 Automatically Collected Information</h3>
            <p className="text-gray-700 leading-relaxed mb-4">When you access our Service, we automatically collect:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on platform, click patterns</li>
              <li><strong>Location Data:</strong> General geographic location (country/region level)</li>
              <li><strong>Cookies:</strong> See our Cookie Policy for details</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.3 Information from Third Parties</h3>
            <p className="text-gray-700 leading-relaxed mb-4">We may receive information from:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Social Login:</strong> If you sign in with Google, we receive your name and email</li>
              <li><strong>Payment Processors:</strong> Transaction confirmations from Paystack</li>
              <li><strong>Service Providers:</strong> Analytics and monitoring services</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We use your information for the following purposes:</p>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.1 Service Delivery</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Create and manage your account</li>
              <li>Process your transactions and payments</li>
              <li>Provide customer support</li>
              <li>Generate AI content (videos, photos, descriptions)</li>
              <li>Send service-related notifications</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.2 Improvement & Analytics</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Analyze usage patterns to improve our Service</li>
              <li>Develop new features and functionality</li>
              <li>Monitor and prevent technical issues</li>
              <li>Conduct research and analysis</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.3 Communication</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Send account notifications and updates</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Send marketing communications (with your consent)</li>
              <li>Notify you about changes to our policies</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.4 Legal & Security</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Comply with legal obligations</li>
              <li>Protect against fraudulent or illegal activity</li>
              <li>Enforce our Terms of Service</li>
              <li>Protect the rights and safety of our users</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Legal Basis for Processing (POPIA)</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Under POPIA, we process your personal information based on the following legal grounds:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Contractual Necessity:</strong> Processing necessary to perform our contract with you</li>
              <li><strong>Consent:</strong> You have given explicit consent for specific processing</li>
              <li><strong>Legitimate Interest:</strong> Processing necessary for our legitimate business interests</li>
              <li><strong>Legal Obligation:</strong> Processing required to comply with the law</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Sharing & Disclosure</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We do not sell your personal information. We may share your information with:
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.1 Service Providers</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Third-party vendors who help us provide the Service, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Cloud hosting providers (Supabase, AWS)</li>
              <li>Payment processors (Paystack)</li>
              <li>AI service providers (xAI, Fal.ai, AWS Polly)</li>
              <li>Analytics and monitoring services</li>
              <li>Customer support tools</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.2 Legal Requirements</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may disclose information when required by law, such as:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Comply with legal process or government request</li>
              <li>Protect the rights, property, or safety of our company, users, or others</li>
              <li>Investigate fraud or security issues</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.3 Business Transfers</h3>
            <p className="text-gray-700 leading-relaxed">
              In connection with a merger, acquisition, or sale of assets, your information may be transferred. 
              We will notify you of any such change.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Security</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We implement appropriate technical and organizational measures to protect your personal information:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Encryption of data in transit (TLS/SSL) and at rest</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Access controls and authentication measures</li>
              <li>Employee training on data protection</li>
              <li>Incident response procedures</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              However, no method of transmission over the Internet or electronic storage is 100% secure. 
              While we strive to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights (POPIA)</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Under POPIA, you have the following rights regarding your personal information:
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.1 Right to Access</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request a copy of the personal information we hold about you. You don't need to ask —
              sign in and download it instantly from <strong>Settings → Privacy → Data Export</strong>
              (profile, projects and your full credit ledger as JSON or CSV).
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.2 Right to Correction</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request correction of inaccurate or incomplete personal information.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.3 Right to Deletion</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request deletion of your personal information, subject to legal obligations.
              Self-service: <strong>Settings → Privacy → Request Account Deletion</strong> (or{' '}
              <Link to="/dashboard/delete-account" className="text-purple-700 hover:text-purple-800 underline">Delete Account</Link>),
              confirmed with your password. Your profile, projects and sessions are removed immediately and
              generated media is purged within 30 days; invoice records are kept only as long as tax law
              requires. If you can no longer sign in, contact our Information Officer (section 12) and we'll
              verify you by email before deleting.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.4 Right to Object</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can object to processing of your personal information in certain circumstances.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.5 Right to Data Portability</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You can request your data in a structured, machine-readable format — the Data Export in
              Settings downloads it as JSON (or CSV for transactions) immediately.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7.6 Right to Withdraw Consent</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Where processing is based on consent, you can withdraw consent at any time.
            </p>

            <p className="text-gray-700 leading-relaxed">
              To exercise any of these rights, please contact us at privacy@propreel.co.za. We will respond 
              within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We retain your personal information only as long as necessary:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Account Data:</strong> While your account is active</li>
              <li><strong>Transaction Records:</strong> 7 years (tax compliance)</li>
              <li><strong>Project Data:</strong> Until account deletion</li>
              <li><strong>Generated Media:</strong> 30 days from creation — uploaded photos, AI-edited images (Photo Editor, Virtual Staging, Furniture Removal, Twilight), rendered videos and AI Avatar Video clips are permanently deleted from AWS storage after 30 days, automatically every night. Download anything you want to keep before it expires.</li>
              <li><strong>Audit Logs:</strong> 2 years</li>
              <li><strong>Login History:</strong> 1 year</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              After retention periods expire, we securely delete or anonymize your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Your data is primarily stored in South Africa (af-south-1 region). Some processing may occur in 
              other jurisdictions where our service providers operate. We ensure appropriate safeguards are in 
              place for international transfers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our Service is not intended for individuals under 18 years of age. We do not knowingly collect 
              personal information from children. If we learn we have collected data from a child under 18, 
              we will delete it immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may update this Privacy Policy from time to time. We will notify you of material changes by 
              email or through the Service at least 30 days before they take effect.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Your continued use of the Service after changes become effective constitutes acceptance of the 
              updated policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Information Officer (POPIA)</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              In accordance with POPIA, we have appointed an Information Officer responsible for compliance:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <p className="font-semibold text-gray-900 mb-2">Information Officer</p>
              <p className="text-gray-700 mb-1">Email: information.officer@propreel.co.za</p>
              <p className="text-gray-700">For POPIA-related inquiries and requests</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have questions about this Privacy Policy or wish to exercise your rights:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-purple-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Privacy Inquiries</p>
                  <p className="text-gray-700">privacy@propreel.co.za</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Information Officer</p>
                  <p className="text-gray-700">information.officer@propreel.co.za</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-purple-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Data Export Request</p>
                  <p className="text-gray-700">Use "Export My Data" in your account settings</p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-gray-200 pt-8 mt-12">
            <p className="text-sm text-gray-500 text-center">
              © 2025 PropReel. All rights reserved. This Privacy Policy is effective as of March 2025.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
