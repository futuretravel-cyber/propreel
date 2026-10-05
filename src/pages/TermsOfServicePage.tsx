import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, Clock, Mail } from 'lucide-react';
import { AI_DISCLAIMER_TEXT } from '../lib/aiDisclaimer';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileText className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-gray-900">Terms of Service</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: October 2026</p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8">
            <p className="text-purple-900 font-semibold mb-2">Important Notice</p>
            <p className="text-purple-800 text-sm">
              By accessing or using PropReel's services, you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              These Terms of Service ("Terms") govern your access to and use of PropReel's website, applications, 
              and services (collectively, the "Service"). These Terms apply to all users, including agents, agencies, 
              and any other users of the Service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              By creating an account, accessing the Service, or using any PropReel features, you agree to be bound 
              by these Terms and our Privacy Policy. If you are using the Service on behalf of an agency or company, 
              you represent and warrant that you have authority to bind that entity to these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel provides AI-powered property marketing tools, including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>AI-generated property videos from photos</li>
              <li>AI photo editing and enhancement</li>
              <li>Virtual staging services</li>
              <li>Furniture removal from photos</li>
              <li>Twilight photography conversion</li>
              <li>Social media caption generation</li>
              <li>Property description generation</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              The Service is provided on a subscription basis with credit-based usage. Credits are consumed when 
              you use various features of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To access certain features, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Promptly notify us of any unauthorized use of your account</li>
              <li>Be responsible for all activities that occur under your account</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You must be at least 18 years old to create an account. You may not create an account for someone else 
              without their express permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Credits and Billing</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Credit System:</strong> The Service uses a credit-based system. Different features consume different 
              amounts of credits. Credit costs are displayed before you use any feature.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Subscription Plans:</strong> Monthly and annual subscription plans include a set number of credits. 
              Unused subscription credits roll over to the next month but expire at your next renewal date.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Purchased Credits:</strong> Credits purchased as top-ups are non-refundable but never expire as long 
              as your account remains active (365 days of inactivity will result in expiry).
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Payment:</strong> All payments are processed through Paystack. By subscribing or purchasing credits, 
              you authorize us to charge your payment method for the applicable amounts.
            </p>
            <p className="text-gray-700 leading-relaxed">
              <strong>Refunds:</strong> Please refer to our <Link to="/refund-policy" className="text-purple-700 hover:text-purple-800 font-medium">Refund Policy</Link> for 
              detailed information on refunds and cancellations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. AI-Generated Content</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>AI Technology:</strong> The Service uses artificial intelligence to generate videos, edit photos, 
              create descriptions, and produce other content. You acknowledge that:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>AI-generated content may not always be perfect or accurate</li>
              <li>You are responsible for reviewing all AI-generated content before use</li>
              <li>PropReel does not guarantee specific results from AI features</li>
              <li>AI may produce variations each time, even with the same inputs</li>
              <li><strong>Credits spent on unsatisfactory results are non-refundable</strong></li>
            </ul>

            {/* Verbatim from lib/aiDisclaimer — the same notice every render
                is gated behind in the app. */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4" role="note">
              <p className="text-amber-900 font-semibold mb-2">AI-generated content notice — acknowledged before your first render</p>
              <p className="text-amber-800 text-sm leading-relaxed">{AI_DISCLAIMER_TEXT}</p>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Ownership:</strong> You retain ownership of the photos and property information you upload. 
              AI-generated content created through the Service is licensed to you for your business use.
            </p>
            <p className="text-gray-700 leading-relaxed">
              <strong>Accuracy:</strong> You are solely responsible for ensuring that all content generated through 
              the Service accurately represents the property and complies with all applicable laws and regulations, 
              including property marketing regulations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights of others</li>
              <li>Upload content you do not have the right to use</li>
              <li>Create misleading or deceptive property marketing materials</li>
              <li>Attempt to reverse engineer or compromise the Service</li>
              <li>Share your account credentials with unauthorized users</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Interfere with or disrupt the Service or servers</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Violation of these terms may result in immediate termination of your account without refund.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Your Content:</strong> You retain all rights to the photos, property information, and other 
              content you upload to the Service.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>PropReel Content:</strong> The Service, including its design, features, and underlying technology, 
              is owned by PropReel and protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-gray-700 leading-relaxed">
              <strong>License:</strong> By using the Service, you grant PropReel a limited license to process your 
              uploaded content solely for the purpose of providing the Service to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROPREEL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, 
              BUSINESS OPPORTUNITIES, OR GOODWILL.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              IN NO EVENT SHALL PROPREEL'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID TO 
              PROPREEL IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
            <p className="text-gray-700 leading-relaxed">
              THIS LIMITATION APPLIES TO ALL CAUSES OF ACTION, INCLUDING BREACH OF CONTRACT, NEGLIGENCE, STRICT 
              LIABILITY, TORT, AND ANY OTHER LEGAL THEORY.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS 
              OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
              PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-gray-700 leading-relaxed">
              PROPREEL DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT 
              DEFECTS WILL BE CORRECTED, OR THAT THE SERVICE OR THE SERVERS THAT MAKE IT AVAILABLE ARE FREE 
              OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Termination</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Your Right to Terminate:</strong> You may terminate your account at any time by contacting 
              us or using the account deletion feature. Upon termination, your right to use the Service will 
              immediately cease.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              <strong>Our Right to Terminate:</strong> We may terminate or suspend your account immediately, 
              without prior notice, for any conduct that we believe violates these Terms or is harmful to other 
              users, us, or third parties.
            </p>
            <p className="text-gray-700 leading-relaxed">
              <strong>Effect of Termination:</strong> Upon termination, all provisions of these Terms which by 
              their nature should survive will remain in effect, including ownership, disclaimers, indemnity, 
              and limitations of liability.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the Republic of 
              South Africa, without regard to its conflict of law provisions. Any disputes arising under or 
              in connection with these Terms shall be subject to the exclusive jurisdiction of the courts 
              located in Cape Town, South Africa.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to modify these Terms at any time. We will provide notice of significant 
              changes by email or through the Service. Your continued use of the Service after such modifications 
              constitutes your acceptance of the updated Terms.
            </p>
            <p className="text-gray-700 leading-relaxed">
              We encourage you to review these Terms periodically to stay informed about our practices.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions about these Terms, please contact us:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-3">
                <Mail className="w-5 h-5 text-purple-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Email</p>
                  <p className="text-gray-700">legal@propreel.co.za</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Information Officer</p>
                  <p className="text-gray-700">For POPIA-related inquiries</p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-gray-200 pt-8 mt-12">
            <p className="text-sm text-gray-500 text-center">
              © 2026 PropReel. All rights reserved. These Terms of Service are effective as of October 2026.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
