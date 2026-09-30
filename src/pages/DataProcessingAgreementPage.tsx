import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield, Database } from 'lucide-react';

export default function DataProcessingAgreementPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Database className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-gray-900">Data Processing Agreement</h1>
            <p className="text-sm text-gray-500 mt-1">POPIA & GDPR Compliant</p>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8">
          <p className="text-purple-900 font-semibold mb-2">About This Agreement</p>
          <p className="text-purple-800 text-sm">
            This Data Processing Agreement (DPA) governs the processing of personal data by PropReel on behalf 
            of our customers (Data Controllers) in compliance with POPIA and GDPR requirements.
          </p>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Definitions</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              In this Agreement:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>"Data Controller"</strong> means the customer (agency or individual agent) who determines the purposes and means of processing personal data</li>
              <li><strong>"Data Processor"</strong> means PropReel, who processes personal data on behalf of the Data Controller</li>
              <li><strong>"Personal Data"</strong> means any information relating to an identified or identifiable natural person</li>
              <li><strong>"Processing"</strong> means any operation performed on personal data, including collection, storage, use, and deletion</li>
              <li><strong>"Data Subject"</strong> means the individual whose personal data is being processed</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Scope and Purpose</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              This Agreement applies to all processing of personal data by PropReel on behalf of the Data Controller 
              through the use of the PropReel Service. The purpose of processing is to provide AI-powered property 
              marketing services, including video generation, photo editing, and content creation.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Obligations of the Data Controller</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Data Controller shall:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Ensure that the processing of personal data complies with applicable data protection laws</li>
              <li>Obtain all necessary consents from data subjects before providing their data to PropReel</li>
              <li>Provide accurate and complete personal data to PropReel</li>
              <li>Notify data subjects of the processing and provide them with required information</li>
              <li>Respond to data subject requests (access, correction, deletion) in coordination with PropReel</li>
              <li>Ensure that instructions to PropReel are lawful and compliant with data protection laws</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Obligations of the Data Processor</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel shall:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Process personal data only on documented instructions from the Data Controller</li>
              <li>Ensure that personnel authorized to process personal data are bound by confidentiality obligations</li>
              <li>Implement appropriate technical and organizational security measures</li>
              <li>Not engage sub-processors without prior written consent from the Data Controller</li>
              <li>Assist the Data Controller in responding to data subject requests</li>
              <li>Assist the Data Controller in ensuring compliance with security and breach notification obligations</li>
              <li>Delete or return all personal data after termination of the Service</li>
              <li>Make available all information necessary to demonstrate compliance with this Agreement</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Security Measures</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel implements the following security measures:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Encryption:</strong> Data encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
              <li><strong>Access Controls:</strong> Role-based access control with multi-factor authentication</li>
              <li><strong>Network Security:</strong> Firewalls, intrusion detection, and regular security audits</li>
              <li><strong>Data Center Security:</strong> Physical security, environmental controls, 24/7 monitoring</li>
              <li><strong>Backup and Recovery:</strong> Daily backups with 30-day retention, disaster recovery plan</li>
              <li><strong>Employee Training:</strong> Regular security awareness and data protection training</li>
              <li><strong>Incident Response:</strong> Documented procedures for security incidents</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Sub-Processors</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel uses the following sub-processors to provide the Service:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 font-semibold text-gray-900">Sub-Processor</th>
                    <th className="text-left py-2 font-semibold text-gray-900">Purpose</th>
                    <th className="text-left py-2 font-semibold text-gray-900">Location</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-gray-200">
                    <td className="py-2">Supabase</td>
                    <td className="py-2">Database and authentication</td>
                    <td className="py-2">South Africa</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2">AWS</td>
                    <td className="py-2">Storage and AI services</td>
                    <td className="py-2">South Africa</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2">Paystack</td>
                    <td className="py-2">Payment processing</td>
                    <td className="py-2">South Africa</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2">xAI</td>
                    <td className="py-2">AI text generation</td>
                    <td className="py-2">USA</td>
                  </tr>
                  <tr>
                    <td className="py-2">Fal.ai</td>
                    <td className="py-2">AI image processing</td>
                    <td className="py-2">USA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-700 leading-relaxed">
              PropReel will notify the Data Controller of any changes to sub-processors with at least 30 days notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Data Subject Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              PropReel will assist the Data Controller in fulfilling data subject rights, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Right of Access:</strong> Providing copies of personal data</li>
              <li><strong>Right to Rectification:</strong> Correcting inaccurate data</li>
              <li><strong>Right to Erasure:</strong> Deleting personal data</li>
              <li><strong>Right to Restriction:</strong> Limiting processing</li>
              <li><strong>Right to Data Portability:</strong> Providing data in machine-readable format</li>
              <li><strong>Right to Object:</strong> Stopping processing based on legitimate interests</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              The Data Controller must notify PropReel within 5 business days of receiving a data subject request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Data Breach Notification</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              In the event of a personal data breach, PropReel will:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Notify the Data Controller without undue delay (within 24 hours of discovery)</li>
              <li>Provide details of the breach, including nature, scope, and likely consequences</li>
              <li>Describe measures taken or proposed to address the breach</li>
              <li>Assist the Data Controller in notifying supervisory authorities and data subjects</li>
              <li>Document the breach and maintain records</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Transfers</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Personal data is primarily stored in South Africa. Some processing may occur in other jurisdictions 
              (USA for AI services). PropReel ensures appropriate safeguards are in place:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Standard Contractual Clauses (SCCs) for transfers outside South Africa</li>
              <li>Data Processing Agreements with all sub-processors</li>
              <li>Technical measures (encryption) for data in transit</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Audits and Compliance</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Data Controller has the right to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Request information about PropReel's compliance with this Agreement</li>
              <li>Conduct audits or inspections (with reasonable notice)</li>
              <li>Request copies of security certifications and audit reports</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              PropReel will provide annual compliance reports and make relevant certifications available upon request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Term and Termination</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              This Agreement remains in effect for as long as PropReel processes personal data on behalf of the 
              Data Controller. Upon termination:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>PropReel will delete or return all personal data within 30 days</li>
              <li>PropReel will certify deletion upon request</li>
              <li>Existing copies may remain in backups for up to 90 days before deletion</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Liability</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Each party's liability under this Agreement is subject to the limitations in the Terms of Service. 
              PropReel is liable for damages caused by processing that violates this Agreement or applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              This Agreement is governed by the laws of the Republic of South Africa. Any disputes will be subject 
              to the exclusive jurisdiction of the courts in Cape Town, South Africa.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              For questions about this Data Processing Agreement:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-gray-900">Email</p>
                  <p className="text-gray-700">dpa@propreel.co.za</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Information Officer</p>
                  <p className="text-gray-700">information.officer@propreel.co.za</p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-gray-200 pt-8 mt-12">
            <p className="text-sm text-gray-500 text-center">
              © 2025 PropReel. All rights reserved. This Data Processing Agreement is effective as of March 2025.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
