import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield, Mail, Clock } from 'lucide-react';

export default function PAIAManualPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Shield className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white">PAIA Manual</h1>
            <p className="text-sm text-ink-500 mt-1">Promotion of Access to Information Act</p>
          </div>
        </div>

        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6 mb-8">
          <p className="text-purple-200 font-semibold mb-2">About PAIA</p>
          <p className="text-purple-200 text-sm">
            The Promotion of Access to Information Act (PAIA) gives you the right to access information held by 
            public and private bodies. This manual explains how to request access to information held by PropReel.
          </p>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              This manual is provided in terms of Section 51 of the Promotion of Access to Information Act 2 of 2000 
              ("PAIA"). It provides information about how to request access to records held by PropReel.
            </p>
            <p className="text-ink-300 leading-relaxed">
              PropReel is committed to transparency and will assist requesters to make their requests as clear and 
              straightforward as possible.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">2. Contact Details</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              All PAIA requests should be directed to our Information Officer:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-white">Information Officer</p>
                  <p className="text-ink-300">PropReel Information Officer</p>
                </div>
                <div>
                  <p className="font-semibold text-white">Email</p>
                  <p className="text-ink-300">information.officer@propreel.co.za</p>
                </div>
                <div>
                  <p className="font-semibold text-white">Postal Address</p>
                  <p className="text-ink-300">
                    PropReel (Pty) Ltd<br />
                    Cape Town<br />
                    Western Cape<br />
                    South Africa
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-white">Office Hours</p>
                  <p className="text-ink-300">Monday to Friday, 09:00 - 17:00 (SAST)</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">3. Guide to the Act</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              The South African Human Rights Commission (SAHR Commission) has compiled a guide on how to use PAIA. 
              The guide is available at:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <p className="text-ink-300 mb-2">
                <strong>South African Human Rights Commission</strong>
              </p>
              <p className="text-ink-300 mb-2">
                Email: paia@sahrc.org.za<br />
                Website: www.sahrc.org.za<br />
                Phone: 011 877 3600
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">4. How to Request Access to Information</h2>
            
            <h3 className="text-xl font-semibold text-white mt-6 mb-3">4.1 Submitting a Request</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              To request access to a record held by PropReel, you must:
            </p>
            <ol className="list-decimal pl-6 text-ink-300 space-y-2 mb-4">
              <li>Complete the prescribed form (Form 2 for requests to private bodies)</li>
              <li>Send the completed form to the Information Officer via email or post</li>
              <li>Provide sufficient detail to identify the record you are requesting</li>
              <li>Indicate which form of access you require (inspection, copy, etc.)</li>
              <li>Pay the required request fee (if applicable)</li>
            </ol>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">4.2 Prescribed Form</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              The prescribed form (Form 2) can be obtained from:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>The Information Officer at the email address above</li>
              <li>The Department of Justice website: www.justice.gov.za</li>
              <li>The SAHR Commission website: www.sahrc.org.za</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">4.3 Information Required</h3>
            <p className="text-ink-300 leading-relaxed mb-4">
              Your request must include:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>Your full name and contact details</li>
              <li>Proof of identity (copy of ID document or passport)</li>
              <li>Description of the record(s) you are requesting</li>
              <li>Explanation of why you need the information (to exercise or protect a right)</li>
              <li>Preferred format for receiving the information</li>
              <li>Payment of the request fee (if applicable)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">5. Fees</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              The following fees apply to PAIA requests:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 font-semibold text-white">Item</th>
                    <th className="text-right py-2 font-semibold text-white">Fee</th>
                  </tr>
                </thead>
                <tbody className="text-ink-300">
                  <tr className="border-b border-white/10">
                    <td className="py-2">Request fee</td>
                    <td className="py-2 text-right">R50.00</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2">Search and preparation (per hour)</td>
                    <td className="py-2 text-right">R600.00</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2">Photocopy (A4 per page)</td>
                    <td className="py-2 text-right">R0.60</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2">Computer disk or similar</td>
                    <td className="py-2 text-right">Actual cost</td>
                  </tr>
                  <tr>
                    <td className="py-2">Transcription of audio/visual</td>
                    <td className="py-2 text-right">Actual cost</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-ink-300 leading-relaxed">
              You will be notified of the total fee before we process your request. You may waive the request if 
              the fee is too high.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">6. Timeframes</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              We will respond to your request within the following timeframes:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><strong>Standard requests:</strong> 30 days from receipt of complete request</li>
              <li><strong>Complex requests:</strong> May be extended by additional 30 days with notification</li>
              <li><strong>Urgent requests:</strong> Where failure to disclose would prejudice life or liberty</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">7. Grounds for Refusal</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              We may refuse access to a record if:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>The record contains personal information about a third party (unless they consent)</li>
              <li>Disclosure could cause harm to commercial interests</li>
              <li>The record is subject to legal privilege</li>
              <li>Disclosure would endanger the safety of any person</li>
              <li>The request is frivolous or vexatious</li>
              <li>The record does not exist or cannot be found after reasonable search</li>
            </ul>
            <p className="text-ink-300 leading-relaxed">
              If we refuse your request, we will provide written reasons and inform you of your right to appeal.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">8. Appeals</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              If your request is refused, you may:
            </p>
            <ol className="list-decimal pl-6 text-ink-300 space-y-2 mb-4">
              <li>Request internal appeal (if applicable)</li>
              <li>Apply to the Information Regulator for assistance</li>
              <li>Apply to a court for judicial review</li>
            </ol>
            <p className="text-ink-300 leading-relaxed">
              Appeals must be lodged within 30 days of receiving the decision.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">9. Records Available</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              PropReel holds the following categories of records:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li><strong>Corporate Records:</strong> Company registration documents, policies, procedures</li>
              <li><strong>Financial Records:</strong> Annual financial statements, tax records</li>
              <li><strong>User Data:</strong> Account information (subject to privacy protections)</li>
              <li><strong>Technical Records:</strong> System documentation, security policies</li>
              <li><strong>Legal Records:</strong> Contracts, compliance documentation</li>
              <li><strong>Operational Records:</strong> Business processes, service descriptions</li>
            </ul>
            <p className="text-ink-300 leading-relaxed">
              Note: Personal information of other users is protected and may not be disclosed without consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">10. Your Own Information</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              If you are requesting access to your own personal information held by PropReel, you can:
            </p>
            <ul className="list-disc pl-6 text-ink-300 space-y-2 mb-4">
              <li>Use the "Export My Data" feature in your account settings</li>
              <li>Contact us at privacy@propreel.co.za for a data export</li>
              <li>Request deletion of your account and data</li>
            </ul>
            <p className="text-ink-300 leading-relaxed">
              These requests are processed under our Privacy Policy and do not require a formal PAIA request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">11. Updates to This Manual</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              This manual is reviewed regularly and updated as necessary. The current version is available on our 
              website and can be requested from the Information Officer.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">12. Contact Information</h2>
            <p className="text-ink-300 leading-relaxed mb-4">
              For any questions about this manual or to submit a PAIA request:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-purple-300 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Email</p>
                    <p className="text-ink-300">information.officer@propreel.co.za</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-purple-300 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Response Time</p>
                    <p className="text-ink-300">Within 30 days of receiving complete request</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8 mt-12">
            <p className="text-sm text-ink-500 text-center">
              © 2025 PropReel. All rights reserved. This PAIA Manual is effective as of March 2025.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
